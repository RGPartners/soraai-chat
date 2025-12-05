import { EventEmitter } from 'events';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Embeddings } from '@langchain/core/embeddings';
import type { MetaSearchAgentType } from './metaSearchAgent';
import { serverFileStorage } from '@/lib/storage';
import { buildOriginalKey } from '@/lib/storage/uploaded-files';
import logger from '@/lib/logger';
import {
  buildValidationSources,
  formatValidationMessage,
  serialiseValidationOutcome,
  validateEbmInvoice,
} from '@/lib/ebm';
import {
  ebmValidatorSystemPrompt,
  ebmValidatorUserTemplate,
} from '@/lib/prompts';

interface ResolvedFileReference {
  fileId: string;
  extension: 'pdf';
}

const SUPPORTED_EXTENSIONS: Array<ResolvedFileReference['extension']> = ['pdf'];

const serialiseDocuments = (documents: ReturnType<typeof buildValidationSources>) =>
  documents.map((doc) => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata,
  }));

const normaliseLlmContent = (content: unknown): string | null => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object' && 'text' in item) {
          const maybeText = (item as { text?: unknown }).text;
          return typeof maybeText === 'string' ? maybeText : '';
        }
        return '';
      })
      .join('');
  }

  if (content && typeof content === 'object' && 'text' in content) {
    const maybeText = (content as { text?: unknown }).text;
    return typeof maybeText === 'string' ? maybeText : null;
  }

  return null;
};

const resolvePdfAttachment = async (
  fileIds: string[],
): Promise<ResolvedFileReference | null> => {
  for (const fileId of fileIds) {
    for (const extension of SUPPORTED_EXTENSIONS) {
      const key = buildOriginalKey(fileId, extension);
      try {
        const exists = await serverFileStorage.exists(key);
        if (exists) {
          return { fileId, extension };
        }
      } catch (error) {
        // Storage drivers may throw for missing keys; treat as non-existent and continue.
      }
    }
  }

  return null;
};

const ebmLogger = logger.withDefaults({ tag: 'search:ebm-agent' });

class EbmValidatorAgent implements MetaSearchAgentType {
  async searchAndAnswer(
    message: string,
    history: BaseMessage[],
    llm: BaseChatModel,
    _embeddings: Embeddings,
    _optimizationMode: 'speed' | 'balanced' | 'quality',
    fileIds: string[],
    _systemInstructions: string,
  ) {
    const emitter = new EventEmitter();

    queueMicrotask(() => {
      (async () => {
        ebmLogger.info('Starting EBM validation run.', {
          messageLength: message.length,
          historyTurns: history.length,
          fileCount: fileIds.length,
        });

        if (!fileIds || fileIds.length === 0) {
          emitter.emit(
            'data',
            JSON.stringify({
              type: 'error',
              data: 'Attach at least one PDF invoice to run the EBM validator.',
            }),
          );
          emitter.emit('end');
          return;
        }

        const resolved = await resolvePdfAttachment(fileIds);

        if (!resolved) {
          emitter.emit(
            'data',
            JSON.stringify({
              type: 'error',
              data: 'No attached PDF invoice could be located. Upload a Rwanda EBM PDF and retry.',
            }),
          );
          emitter.emit('end');
          return;
        }

        try {
          const outcome = await validateEbmInvoice({
            fileId: resolved.fileId,
            fileExtension: resolved.extension,
          });

          const sources = buildValidationSources(outcome);
          emitter.emit(
            'data',
            JSON.stringify({
              type: 'sources',
              data: serialiseDocuments(sources),
            }),
          );

          const serialisedOutcome = serialiseValidationOutcome(outcome);
          const validationJson = JSON.stringify(serialisedOutcome, null, 2);

          let messageText = formatValidationMessage(outcome);

          try {
            const prompt = ebmValidatorUserTemplate
              .replace('{userQuery}', message)
              .replace('{validationJson}', validationJson);

            const response = await llm.invoke([
              new SystemMessage(ebmValidatorSystemPrompt),
              new HumanMessage(prompt),
            ]);

            const rawContent = (response as { content?: unknown }).content;
            const normalised = normaliseLlmContent(rawContent);

            if (normalised && normalised.trim().length > 0) {
              messageText = normalised.trim();
            } else {
              ebmLogger.warn('LLM returned empty content, using formatter fallback.', {
                fileId: resolved.fileId,
              });
            }
          } catch (llmError) {
            ebmLogger.error('Failed to generate LLM narrative for EBM validation.', {
              error: llmError,
              fileId: resolved.fileId,
            });
          }

          emitter.emit(
            'data',
            JSON.stringify({
              type: 'response',
              data: messageText,
            }),
          );

          ebmLogger.info('EBM validation completed successfully.', {
            fileId: resolved.fileId,
            summary: outcome.result.summary?.headline,
          });
        } catch (error) {
          ebmLogger.error('EBM validation failed.', {
            error,
            fileId: resolved.fileId,
          });
          emitter.emit(
            'data',
            JSON.stringify({
              type: 'error',
              data: 'Failed to validate the attached invoice. Please try again.',
            }),
          );
        } finally {
          emitter.emit('end');
        }
      })().catch((error) => {
        ebmLogger.error('EBM validation encountered an unexpected error.', error);
        emitter.emit(
          'data',
          JSON.stringify({
            type: 'error',
            data: 'An unexpected error occurred during validation.',
          }),
        );
        emitter.emit('end');
      });
    });

    return emitter;
  }
}

export default EbmValidatorAgent;
