const FALLBACK_IMAGE = '/logo/logo-light-mode.png';

export const normalizeThumbnailUrl = (thumbnail?: string | null) => {
  if (!thumbnail) {
    return FALLBACK_IMAGE;
  }

  try {
    const parsed = new URL(thumbnail);
    const id = parsed.searchParams.get('id');

    if (id) {
      return `${parsed.origin}${parsed.pathname}?id=${id}`;
    }

    return parsed.toString();
  } catch {
    return thumbnail || FALLBACK_IMAGE;
  }
};
