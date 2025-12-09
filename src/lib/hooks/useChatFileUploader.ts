'use client';

import crypto from 'crypto';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth/client';
import { canUploadFiles } from '@/lib/auth/client-permissions';
import { useChat, type File as ChatFile } from './useChat';

const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt'] as const;

const normalizeExtension = (fileName: string) =>
  fileName.split('.').pop()?.toLowerCase() ?? '';

const buildChatFile = (
  uploaded: { fileName: string; fileExtension: string; fileId: string },
  original?: globalThis.File,
): ChatFile => ({
  clientId: crypto.randomUUID(),
  fileId: uploaded.fileId,
  fileName: uploaded.fileName,
  fileExtension: uploaded.fileExtension,
  mimeType: original?.type,
  size: original?.size,
  uploadedAt: new Date().toISOString(),
});

export const useChatFileUploader = () => {
  const { setFiles, setFileIds } = useChat();
  const { data: session } = authClient.useSession();
  const [isUploading, setIsUploading] = useState(false);

  const role = session?.user.role;
  const isAllowedToUpload = useMemo(
    () => canUploadFiles(role),
    [role],
  );

  const uploadFiles = useCallback(
    async (input: FileList | globalThis.File[] | null | undefined) => {
      const files = Array.from(input ?? []).filter(Boolean);
      if (files.length === 0) {
        return;
      }

      if (!isAllowedToUpload) {
        toast.error('You do not have permission to upload files.');
        return;
      }

      const invalid = files.find((file) => {
        const ext = normalizeExtension(file.name);
        return !SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number]);
      });

      if (invalid) {
        toast.error('Only PDF, DOCX, or TXT files are supported.');
        return;
      }

      const embeddingProvider = localStorage.getItem('embeddingModelProviderId');
      const embeddingModelKey = localStorage.getItem('embeddingModelKey');

      if (!embeddingProvider || !embeddingModelKey) {
        toast.error('Embedding model is not configured. Please choose one in settings.');
        return;
      }

      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('embedding_model_provider_id', embeddingProvider);
      formData.append('embedding_model_key', embeddingModelKey);

      setIsUploading(true);
      try {
        const response = await fetch('/api/uploads', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const message =
            typeof errorBody?.message === 'string'
              ? errorBody.message
              : 'Failed to upload files. Please try again.';
          toast.error(message);
          return;
        }

        const payload: {
          files: Array<{ fileName: string; fileExtension: string; fileId: string }>;
        } = await response.json();

        if (!Array.isArray(payload.files) || payload.files.length === 0) {
          toast.error('Upload did not return any files.');
          return;
        }

        setFiles((prev) => [
          ...prev,
          ...payload.files.map((uploaded, idx) => buildChatFile(uploaded, files[idx])),
        ]);

        setFileIds((prev) => [
          ...prev,
          ...payload.files.map((uploaded) => uploaded.fileId),
        ]);

        toast.success(
          payload.files.length === 1
            ? 'File uploaded successfully.'
            : `${payload.files.length} files uploaded successfully.`,
        );
      } catch (error) {
        console.error('Failed to upload files', error);
        toast.error('An unexpected error occurred while uploading files.');
      } finally {
        setIsUploading(false);
      }
    },
    [isAllowedToUpload, setFileIds, setFiles],
  );

  return {
    uploadFiles,
    isUploading,
  } as const;
};
