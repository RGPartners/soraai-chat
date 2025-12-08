import { parse } from 'node-html-parser';
import { normalizeGlyphs } from '@/lib/discover/utils';
import type { DiscoverArticle } from '@/lib/types/discover';

const RDB_BASE_URL = 'https://rdb.rw';
const RDB_MEDIA_ENDPOINT = `${RDB_BASE_URL}/wp-json/wp/v2/media`;
const RDB_PAGES_ENDPOINT = `${RDB_BASE_URL}/wp-json/wp/v2/pages`;
const COMPANY_LAWS_SLUG = 'c-laws';
const MEDIA_PAGE_SIZE = 60;

const MEDIA_KEYWORDS = [
  'notice',
  'itangazo',
  'law',
  'regulation',
  'compliance',
  'restoration',
  'lottery',
  'assessment',
  'risk',
  'laundering',
  'company',
];

const MEDIA_EXCLUDE = ['job', 'vacancy', 'advert', 'speech', 'remarks', 'conference'];

type RdbMediaItem = {
  id: number;
  date_gmt?: string;
  date?: string;
  title?: { rendered?: string };
  caption?: { rendered?: string };
  description?: { rendered?: string };
  mime_type?: string;
  media_type?: string;
  source_url?: string;
};

type RdbPage = {
  content?: { rendered?: string };
};

const normalizeDate = (value?: string) => {
  if (!value) return undefined;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return undefined;
  return parsedDate.toISOString();
};

const toPlainText = (value?: string) => {
  if (!value) return '';
  return parse(value, {
    lowerCaseTagName: true,
  })
    .text.replace(/\s+/g, ' ')
    .trim();
};

const looksRelevant = (value: string) => {
  const haystack = value.toLowerCase();
  if (MEDIA_EXCLUDE.some((needle) => haystack.includes(needle))) {
    return false;
  }
  return MEDIA_KEYWORDS.some((needle) => haystack.includes(needle));
};

const fetchJson = async <T>(url: string, label: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Perplexica/1.0 (Policy & Legislation)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}. Status: ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const extractMediaDocuments = (
  items: RdbMediaItem[],
  limit: number,
): DiscoverArticle[] => {
  const docs: DiscoverArticle[] = [];
  for (const item of items) {
    if (item.mime_type !== 'application/pdf' || !item.source_url) {
      continue;
    }

    const title = toPlainText(item.title?.rendered);
    const description = toPlainText(
      item.caption?.rendered || item.description?.rendered || title,
    );
    if (!title) continue;

    const haystack = `${title} ${description}`.trim();
    if (!haystack || !looksRelevant(haystack)) continue;

    docs.push({
      title,
      content: description || title,
      url: item.source_url,
      source: 'Rwanda Development Board',
      publishedAt: normalizeDate(item.date_gmt ?? item.date),
    });

    if (docs.length >= limit) break;
  }

  return docs;
};

const fetchMediaDocuments = async (limit: number) => {
  const params = new URLSearchParams({
    media_type: 'application',
    mime_type: 'application/pdf',
    per_page: String(Math.min(Math.max(limit * 2, MEDIA_PAGE_SIZE), 100)),
    orderby: 'date',
    order: 'desc',
  });
  const url = `${RDB_MEDIA_ENDPOINT}?${params.toString()}`;
  const data = await fetchJson<RdbMediaItem[]>(url, 'RDB media attachments');
  return extractMediaDocuments(data, limit);
};

const fetchCompanyLawDocuments = async () => {
  const url = `${RDB_PAGES_ENDPOINT}?slug=${COMPANY_LAWS_SLUG}`;
  const pages = await fetchJson<RdbPage[]>(url, 'RDB company laws page');
  const page = pages[0];
  if (!page?.content?.rendered) return [];

  const root = parse(page.content.rendered, {
    lowerCaseTagName: true,
  });

  const docs: DiscoverArticle[] = [];
  const seen = new Set<string>();

  root.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    const title = anchor.text.replace(/\s+/g, ' ').trim();
    if (!href || !title) return;

    try {
      const absolute = new URL(href, RDB_BASE_URL).toString();
      if (seen.has(absolute)) return;
      seen.add(absolute);
      docs.push({
        title,
        content: title,
        url: absolute,
        source: 'Rwanda Development Board',
      });
    } catch (err) {
      // Ignore invalid URLs
    }
  });

  return docs;
};

export const fetchRdbPolicyDocuments = async (
  limit = 30,
): Promise<DiscoverArticle[]> => {
  const [mediaDocs, companyLawDocs] = await Promise.all([
    fetchMediaDocuments(limit),
    fetchCompanyLawDocuments(),
  ]);

  const combined = [...mediaDocs, ...companyLawDocs];
  const deduped: DiscoverArticle[] = [];
  const seen = new Set<string>();

  combined.forEach((doc) => {
    const key = doc.url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(doc);
  });

  deduped.sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });

  const sliced = deduped.slice(0, limit);
  return sliced.map((article) => ({
    ...article,
    title: normalizeGlyphs(article.title) ?? article.title,
    content: normalizeGlyphs(article.content) ?? article.content,
  }));
};
