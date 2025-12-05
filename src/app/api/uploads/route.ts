import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import ModelRegistry from '@/lib/models/registry';
import { getSessionFromRequest } from '@/lib/auth/session';
import { serverFileStorage } from '@/lib/storage';
import {
  buildEmbeddingsKey,
  buildExtractedKey,
  buildOriginalKey,
  buildPagesKey,
  writeJsonToStorage,
} from '@/lib/storage/uploaded-files';
import { getContentTypeFromFilename } from '@/lib/storage/file-storage/storage-utils';
import logger from '@/lib/logger';

const uploadsLogger = logger.withDefaults({ tag: 'api:uploads' });

interface FileRes {
  fileName: string;
  fileExtension: string;
  fileId: string;
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 100,
});

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 },
      );
    }

    const formData = await req.formData();

    const files = formData.getAll('files') as File[];
    const embedding_model = formData.get('embedding_model_key') as string;
    const embedding_model_provider = formData.get('embedding_model_provider_id') as string;

    if (!embedding_model || !embedding_model_provider) {
      return NextResponse.json(
        { message: 'Missing embedding model or provider' },
        { status: 400 },
      );
    }

    const registry = new ModelRegistry();

    const model = await registry.loadEmbeddingModel(embedding_model_provider, embedding_model);

    const processedFiles: FileRes[] = [];

    const invalidFile = files.find((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return !extension || !['pdf', 'docx', 'txt'].includes(extension);
    });

    if (invalidFile) {
      return NextResponse.json(
        { message: 'File type not supported' },
        { status: 400 },
      );
    }

    for (const file of files) {
      const fileExtension = file.name.split('.').pop()!.toLowerCase();
      const fileId = crypto.randomBytes(16).toString('hex');
      const buffer = Buffer.from(await file.arrayBuffer());

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'soraai-'));
      const tempFilePath = path.join(tempDir, `${fileId}.${fileExtension}`);

      try {
        await fs.writeFile(tempFilePath, buffer);

        let docs: Document[] = [];
        let pageRecords: { pageNumber: number; text: string }[] = [];
        if (fileExtension === 'pdf') {
          const loader = new PDFLoader(tempFilePath);
          docs = await loader.load();
          pageRecords = docs.map((doc, index) => ({
            pageNumber:
              (doc.metadata as Record<string, any>)?.pageNumber ??
              (doc.metadata as Record<string, any>)?.loc?.pageNumber ??
              index + 1,
            text: doc.pageContent,
          }));
        } else if (fileExtension === 'docx') {
          const loader = new DocxLoader(tempFilePath);
          docs = await loader.load();
          pageRecords = [
            {
              pageNumber: 1,
              text: docs.map((doc) => doc.pageContent).join('\n\n'),
            },
          ];
        } else if (fileExtension === 'txt') {
          const text = await fs.readFile(tempFilePath, 'utf-8');
          docs = [
            new Document({ pageContent: text, metadata: { title: file.name } }),
          ];
          pageRecords = [
            {
              pageNumber: 1,
              text,
            },
          ];
        }

        const splitted = await splitter.splitDocuments(docs);

        const originalKey = buildOriginalKey(fileId, fileExtension);
        await serverFileStorage.upload(buffer, {
          key: originalKey,
          filename: `${fileId}.${fileExtension}`,
          contentType:
            file.type || getContentTypeFromFilename(file.name),
        });

        const extractedKey = buildExtractedKey(fileId);
        await writeJsonToStorage(extractedKey, {
          title: file.name,
          contents: splitted.map((doc) => doc.pageContent),
        });

        if (pageRecords.length === 0) {
          pageRecords = docs.map((doc, index) => ({
            pageNumber: index + 1,
            text: doc.pageContent,
          }));
        }

        const pagesKey = buildPagesKey(fileId);
        await writeJsonToStorage(pagesKey, {
          title: file.name,
          pages: pageRecords,
        });

        const embeddings = await model.embedDocuments(
          splitted.map((doc) => doc.pageContent),
        );
        const embeddingsKey = buildEmbeddingsKey(fileId);
        await writeJsonToStorage(embeddingsKey, {
          title: file.name,
          embeddings,
        });

        processedFiles.push({
          fileName: file.name,
          fileExtension: fileExtension,
          fileId,
        });
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }

    return NextResponse.json({
      files: processedFiles,
    });
  } catch (error) {
    uploadsLogger.error('Failed to upload file batch.', error);
    return NextResponse.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
}
