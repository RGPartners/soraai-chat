export const CacheKeys = {
  suggestions: (chatId: string, fingerprint: string) =>
    `suggestions:${chatId}:${fingerprint}`,
  discover: (
    topic: string,
    mode: 'normal' | 'preview',
    country?: string,
  ) => `discover:${mode}:${country ?? 'global'}:${topic}`,
};
