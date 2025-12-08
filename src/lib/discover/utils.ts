import { TAX_KEYWORDS } from './topics';

const keywordGuard = TAX_KEYWORDS.map((word) => word.toLowerCase());

const normalizeKeywords = (keywords: string[]) =>
  keywords.map((keyword) => keyword.toLowerCase()).filter(Boolean);

const toSearchText = (value: string) => value.toLowerCase();

const toItemSearchText = (item: { title?: string; content?: string }) =>
  toSearchText(`${item.title ?? ''} ${item.content ?? ''}`);

type KeywordOptions = {
  includeBase?: boolean;
};

export const includesTaxKeyword = (
  value: string,
  extraKeywords: string[] = [],
  options: KeywordOptions = {},
) => {
  const haystack = toSearchText(value);
  const base = options.includeBase === false ? [] : keywordGuard;
  return [...base, ...normalizeKeywords(extraKeywords)].some((keyword) =>
    haystack.includes(keyword),
  );
};

export const filterDiscoverEntries = <T extends {
  title?: string;
  content?: string;
  url: string;
}>(
  items: T[],
  extraKeywords: string[] = [],
  options: KeywordOptions = {},
) =>
  items.filter((item) =>
    includesTaxKeyword(
      `${item.title ?? ''} ${item.content ?? ''}`,
      extraKeywords,
      options,
    ),
  );

export const matchesKeywords = (
  value: string,
  keywords: string[] = [],
) => {
  if (!keywords.length) return false;
  const haystack = toSearchText(value);
  const normalized = normalizeKeywords(keywords);
  return normalized.some((keyword) => haystack.includes(keyword));
};

export const filterOutDiscoverEntries = <T extends {
  title?: string;
  content?: string;
}>(items: T[], keywords: string[] = []) => {
  if (!keywords.length) return items;
  const normalized = normalizeKeywords(keywords);
  return items.filter((item) => {
    const haystack = toItemSearchText(item);
    return !normalized.some((keyword) => haystack.includes(keyword));
  });
};

export const dedupeByThumbnail = <T extends { title?: string; thumbnail?: string }>(
  items: T[],
) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.thumbnail) return true;
    const key = `${item.thumbnail.toLowerCase()}::${(item.title ?? '').toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const getHost = (url?: string) => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch (err) {
    return undefined;
  }
};

export const getPublishedTimestamp = (value?: string) => {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
};

const GRADIENT_THUMBNAILS = [
  '/gradients/alejandro-ortiz-zNqFgpzMI7Q-unsplash.jpg',
  '/gradients/ikhlas-lNoAcnHIRo0-unsplash.jpg',
  '/gradients/milad-fakurian-5lhMVEAx4s8-unsplash.jpg',
  '/gradients/milad-fakurian-iFu2HILEng8-unsplash.jpg',
  '/gradients/plufow-le-studio-owI5u13p9mE-unsplash.jpg',
];

const GRADIENT_FALLBACK = GRADIENT_THUMBNAILS[0];

const PDF_EXTENSION_REGEX = /\.pdf(\?.*)?$/i;

const computeGradientIndex = (seed: string) => {
  let hash = 0;
  const normalized = seed.trim();
  if (!normalized) return 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = Math.imul(31, hash) + normalized.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
};

const pickGradientBySeed = (seed: string) => {
  if (!GRADIENT_THUMBNAILS.length) return undefined;
  const index = computeGradientIndex(seed) % GRADIENT_THUMBNAILS.length;
  return GRADIENT_THUMBNAILS[index];
};

const isPdfResource = (url?: string) => {
  if (!url) return false;
  return PDF_EXTENSION_REGEX.test(url.trim().toLowerCase());
};

type ThumbnailCandidate = {
  url?: string;
  thumbnail?: string | null;
  title?: string;
};

export const resolveDiscoverThumbnail = (candidate: ThumbnailCandidate): string | undefined => {
  const normalizedThumbnail = candidate.thumbnail?.toString().trim();
  const hasThumbnail = Boolean(normalizedThumbnail);
  const pdfResource = isPdfResource(candidate.url);

  if (hasThumbnail && !pdfResource) {
    return normalizedThumbnail;
  }

  const seed = candidate.url?.toString().trim() || candidate.title?.trim() || normalizedThumbnail || 'perplexica-gradient';
  const gradient = pickGradientBySeed(seed) ?? GRADIENT_FALLBACK;
  return gradient;
};
