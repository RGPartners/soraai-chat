import { normalizeGlyphs } from '@/lib/discover/utils';
import type { DiscoverArticle } from '@/lib/types/discover';

const BNR_BASE_URL = 'https://bnr.rw';
const BNR_REGULATORY_FRAMEWORKS_URL = `${BNR_BASE_URL}/regulatoryframeworks`;

type BnrRegulatoryDocument = {
  name?: string;
  summary?: string;
  file?: string;
  date_last_modified?: string;
};

const absolutize = (href?: string | null) => {
  if (!href) return undefined;
  try {
    return new URL(href, BNR_BASE_URL).toString();
  } catch (err) {
    return undefined;
  }
};

const normalizeDate = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

export const fetchBnrRegulatoryFrameworks = async (
  limit = 20,
): Promise<DiscoverArticle[]> => {
  const response = await fetch(BNR_REGULATORY_FRAMEWORKS_URL, {
    headers: {
      'User-Agent': 'Perplexica/1.0 (Policy & Legislation)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch BNR regulatory frameworks. Status: ${response.status}`,
    );
  }

  const data = (await response.json()) as BnrRegulatoryDocument[];

  const sanitized: DiscoverArticle[] = [];
  const sorted = data
    .filter((doc) => Boolean(doc?.name && doc?.file))
    .sort((a, b) => {
      const aTime = new Date(a.date_last_modified ?? 0).getTime();
      const bTime = new Date(b.date_last_modified ?? 0).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);

  for (const doc of sorted) {
    const url = absolutize(doc.file);
    if (!url) continue;

    sanitized.push({
      title: doc.name!.trim(),
      content: doc.summary?.trim() ?? '',
      url,
      source: 'National Bank of Rwanda',
      publishedAt: normalizeDate(doc.date_last_modified),
    });
  }

  return sanitized.map((article) => ({
    ...article,
    title: normalizeGlyphs(article.title) ?? article.title,
    content: normalizeGlyphs(article.content) ?? article.content,
  }));
};
