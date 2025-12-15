import crypto from 'crypto';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { EventEmitter } from 'stream';
import db from '@/lib/db';
import { messageRepository } from '@/lib/db/pg/repositories/message-repository';
import { chats, messages as messagesSchema } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { getFileDetails } from '@/lib/utils/files';
import { searchHandlers } from '@/lib/search';
import { z } from 'zod';
import ModelRegistry from '@/lib/models/registry';
import { ModelWithProvider } from '@/lib/models/types';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getEntitlementForSession } from '@/lib/entitlements';
import logger from '@/lib/logger';

type ChatRecord = typeof chats.$inferSelect;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const config = {
  regions: ['iad1'],
};

const chatLogger = logger.withDefaults({ tag: 'api:chat' });

const MESSAGE_RATE_LIMIT_WINDOW_HOURS = 24;
const MESSAGE_RATE_LIMIT_ERROR = {
  code: 'guest_limit_reached',
  message:
    'You have reached the free conversation limit for today. Sign in to continue chatting.',
};

const messageSchema = z.object({
  messageId: z.string().min(1, 'Message ID is required'),
  chatId: z.string().min(1, 'Chat ID is required'),
  content: z.string().min(1, 'Message content is required'),
});

const chatModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z.string({
    errorMap: () => ({
      message: 'Chat model provider id must be provided',
    }),
  }),
  key: z.string({
    errorMap: () => ({
      message: 'Chat model key must be provided',
    }),
  }),
});

const embeddingModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z.string({
    errorMap: () => ({
      message: 'Embedding model provider id must be provided',
    }),
  }),
  key: z.string({
    errorMap: () => ({
      message: 'Embedding model key must be provided',
    }),
  }),
});

const bodySchema = z.object({
  message: messageSchema,
  optimizationMode: z.enum(['speed', 'balanced', 'quality'], {
    errorMap: () => ({
      message: 'Optimization mode must be one of: speed, balanced, quality',
    }),
  }),
  focusMode: z.string().min(1, 'Focus mode is required'),
  history: z
    .array(
      z.tuple([z.string(), z.string()], {
        errorMap: () => ({
          message: 'History items must be tuples of two strings',
        }),
      }),
    )
    .optional()
    .default([]),
  files: z.array(z.string()).optional().default([]),
  chatModel: chatModelSchema,
  embeddingModel: embeddingModelSchema,
  systemInstructions: z.string().nullable().optional().default(''),
});

type Message = z.infer<typeof messageSchema>;
type Body = z.infer<typeof bodySchema>;

const safeValidateBody = (data: unknown) => {
  const result = bodySchema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      error: result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    };
  }

  return {
    success: true,
    data: result.data,
  };
};

const handleEmitterEvents = async (
  stream: EventEmitter,
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  chatId: string,
) => {
  let receivedMessage = '';
  const aiMessageId = crypto.randomBytes(7).toString('hex');
  let hasAssistantResponse = false;
  let encounteredError = false;
  let writerClosed = false;

  const writeEvent = (payload: Record<string, unknown>) => {
    if (writerClosed) {
      return;
    }
    writer.write(encoder.encode(`${JSON.stringify(payload)}\n`));
  };

  const closeWriter = () => {
    if (writerClosed) {
      return;
    }
    writer.close();
    writerClosed = true;
  };

  stream.on('data', (data) => {
    const parsedData = JSON.parse(data);
    if (parsedData.type === 'response') {
      hasAssistantResponse = true;
      writeEvent({
        type: 'message',
        data: parsedData.data,
        messageId: aiMessageId,
      });
      receivedMessage += parsedData.data;
    } else if (parsedData.type === 'sources') {
      writeEvent({
        type: 'sources',
        data: parsedData.data,
        messageId: aiMessageId,
      });

      const sourceMessageId = crypto.randomBytes(7).toString('hex');

      db.insert(messagesSchema)
        .values({
          chatId: chatId,
          messageId: sourceMessageId,
          role: 'source',
          sources: parsedData.data,
          createdAt: new Date(),
        })
        .execute();
    } else if (parsedData.type === 'error') {
      encounteredError = true;
      writeEvent({
        type: 'error',
        data: parsedData.data,
      });
      closeWriter();
    }
  });
  stream.on('end', () => {
    if (encounteredError) {
      closeWriter();
      return;
    }

    writeEvent({
      type: 'messageEnd',
      messageId: aiMessageId,
    });
    closeWriter();

    if (hasAssistantResponse && receivedMessage.trim().length > 0) {
      db.insert(messagesSchema)
        .values({
          content: receivedMessage,
          chatId: chatId,
          messageId: aiMessageId,
          role: 'assistant',
          createdAt: new Date(),
        })
        .execute();
    }
  });
  stream.on('error', (data) => {
    encounteredError = true;
    let errorPayload: unknown;
    try {
      const parsedData = JSON.parse(data);
      errorPayload = parsedData.data ?? parsedData;
    } catch (err) {
      errorPayload = data;
    }

    writeEvent({
      type: 'error',
      data: errorPayload,
    });
    closeWriter();
  });
};

const handleHistorySave = async (
  existingChat: ChatRecord | undefined,
  message: Message,
  humanMessageId: string,
  focusMode: string,
  files: string[],
  userId: string,
) => {
  const fileData = files.length
    ? await Promise.all(files.map((fileId) => getFileDetails(fileId)))
    : [];

  if (!existingChat) {
    await db
      .insert(chats)
      .values({
        id: message.chatId,
        title: message.content,
        createdAt: new Date(),
        focusMode: focusMode,
        files: fileData,
        userId,
      })
      .execute();
  } else if (JSON.stringify(existingChat.files ?? []) != JSON.stringify(fileData)) {
    db.update(chats)
      .set({
        files: fileData,
      })
      .where(and(eq(chats.id, message.chatId), eq(chats.userId, userId)));
  }

  const messageExists = await db.query.messages.findFirst({
    where: and(
      eq(messagesSchema.messageId, humanMessageId),
      eq(messagesSchema.chatId, message.chatId),
    ),
  });

  if (!messageExists) {
    await db
      .insert(messagesSchema)
      .values({
        content: message.content,
        chatId: message.chatId,
        messageId: humanMessageId,
        role: 'user',
        createdAt: new Date(),
      })
      .execute();
  } else {
    await db
      .delete(messagesSchema)
      .where(
        and(
          gt(messagesSchema.id, messageExists.id),
          eq(messagesSchema.chatId, message.chatId),
        ),
      )
      .execute();
  }
};

export const POST = async (req: Request) => {
  const requestStartTime = Date.now();
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return Response.json(
        { message: 'Unauthorized' },
        { status: 401 },
      );
    }

    const userId = session.user.id;
    const { entitlement } = getEntitlementForSession(session);

    if (entitlement.maxMessagesPerDay !== null && userId) {
      const since = new Date(
        Date.now() - MESSAGE_RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000,
      );
      const sentMessagesCount = await messageRepository.countUserMessagesSince({
        userId,
        since,
      });

      if (sentMessagesCount >= entitlement.maxMessagesPerDay) {
        return Response.json(MESSAGE_RATE_LIMIT_ERROR, { status: 429 });
      }
    }

    const reqBody = (await req.json()) as Body;

    const parseBody = safeValidateBody(reqBody);
    if (!parseBody.success) {
      return Response.json(
        { message: 'Invalid request body', error: parseBody.error },
        { status: 400 },
      );
    }

    const body = parseBody.data as Body;
    const { message } = body;

    const existingChat = await db.query.chats.findFirst({
      where: eq(chats.id, message.chatId),
    });

    if (existingChat && existingChat.userId && existingChat.userId !== userId) {
      return Response.json({ message: 'Chat not found' }, { status: 404 });
    }

    if (message.content === '') {
      return Response.json(
        {
          message: 'Please provide a message to process',
        },
        { status: 400 },
      );
    }

    const registry = new ModelRegistry();

    chatLogger.debug('Loading models with providers.', {
      chatProviderId: body.chatModel.providerId,
      embeddingProviderId: body.embeddingModel.providerId,
      chatModelKey: body.chatModel.key,
      embeddingModelKey: body.embeddingModel.key,
    });

    const modelLoadStart = Date.now();
    const [llm, embedding] = await Promise.all([
      registry.loadChatModel(body.chatModel.providerId, body.chatModel.key),
      registry.loadEmbeddingModel(
        body.embeddingModel.providerId,
        body.embeddingModel.key,
      ),
    ]);
    chatLogger.info('Models loaded', { durationMs: Date.now() - modelLoadStart });

    const humanMessageId =
      message.messageId ?? crypto.randomBytes(7).toString('hex');

    const history: BaseMessage[] = body.history.map((msg) => {
      if (msg[0] === 'human') {
        return new HumanMessage({
          content: msg[1],
        });
      } else {
        return new AIMessage({
          content: msg[1],
        });
      }
    });

    const handler = searchHandlers[body.focusMode];

    if (!handler) {
      return Response.json(
        {
          message: 'Invalid focus mode',
        },
        { status: 400 },
      );
    }

    const searchStartTime = Date.now();
    chatLogger.info('Starting search and answer', { 
      focusMode: body.focusMode,
      optimizationMode: body.optimizationMode,
      elapsedMs: Date.now() - requestStartTime 
    });

    const stream = await handler.searchAndAnswer(
      message.content,
      history,
      llm,
      embedding,
      body.optimizationMode,
      body.files,
      body.systemInstructions as string,
    );

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();

    handleEmitterEvents(stream, writer, encoder, message.chatId);
    handleHistorySave(
      existingChat,
      message,
      humanMessageId,
      body.focusMode,
      body.files,
      userId,
    );

    return new Response(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    chatLogger.error('Failed to process chat request.', err);
    return Response.json(
      { message: 'An error occurred while processing chat request' },
      { status: 500 },
    );
  }
};
