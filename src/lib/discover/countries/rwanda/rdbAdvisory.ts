import { parse } from 'node-html-parser';
import type { DiscoverArticle } from '@/lib/types/discover';

const RDB_BASE_URL = 'https://rdb.rw';
const RDB_POSTS_ENDPOINT = `${RDB_BASE_URL}/wp-json/wp/v2/posts`;

const ADVISORY_KEYWORDS = [
  'investment',
  'advisory',
  'strategy',
  'planning',
  'financial',
  'finance',
  'capital',
  'wealth',
  'incentive',
  'business',
  'partnership',
  'deal',
  'tax',
  'structuring',
  'promotion',
  'opportunity',
];

const EXCLUDED_KEYWORDS = ['gorilla', 'kwita izina', 'visit rwanda', 'tourism'];

type WordPressRendered = {
  rendered?: string;
};

type WordPressEmbeddedMedia = {
  source_url?: string;
};

type WordPressPost = {
  id: number;
  date?: string;
  date_gmt?: string;
  link?: string;
  title?: WordPressRendered;
  excerpt?: WordPressRendered;
  content?: WordPressRendered;
  _embedded?: {
    'wp:featuredmedia'?: WordPressEmbeddedMedia[];
  };
};

const htmlToText = (value?: string) => {
  if (!value) return '';
  return parse(value, {
    lowerCaseTagName: true,
  })
    .text.replace(/\s+/g, ' ')
    .trim();
};

const normalizeUrl = (value?: string | null) => {
  if (!value) return undefined;
  try {
    return new URL(value, RDB_BASE_URL).toString();
  } catch (err) {
    return undefined;
  }
};

const normalizeDate = (value?: string) => {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
};

const sanitizeThumbnail = (raw?: string) => {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    parsed.searchParams.delete('w');
    parsed.searchParams.delete('resize');
    parsed.searchParams.delete('quality');
    return parsed.toString();
  } catch (err) {
    return raw;
  }
};

const matchesAdvisoryFocus = (title: string, body: string) => {
  const haystack = `${title} ${body}`.toLowerCase();
  if (EXCLUDED_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return false;
  }
  return ADVISORY_KEYWORDS.some((keyword) => haystack.includes(keyword));
};

const fetchJson = async <T>(url: string, label: string): Promise<T> => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Perplexica/1.0 (Advisory Discover)',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${label}. Status: ${res.status}`);
  }

  return (await res.json()) as T;
};

export const fetchRdbAdvisoryInsights = async (
  limit = 24,
): Promise<DiscoverArticle[]> => {
  const perPage = Math.min(Math.max(limit * 2, 24), 60);
  const url = `${RDB_POSTS_ENDPOINT}?per_page=${perPage}&_embed=1`;
  const posts = await fetchJson<WordPressPost[]>(url, 'RDB posts');

  const mapped: DiscoverArticle[] = [];
  const seen = new Set<string>();

  posts.forEach((post) => {
    const title = htmlToText(post.title?.rendered);
    const excerpt =
      htmlToText(post.excerpt?.rendered) || htmlToText(post.content?.rendered);
    const link = normalizeUrl(post.link);

    if (!title || !link) return;

    if (seen.has(link.toLowerCase())) return;
    seen.add(link.toLowerCase());

    const thumbnail = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;

    mapped.push({
      title,
      content: excerpt || title,
      url: link,
      thumbnail: sanitizeThumbnail(thumbnail),
      source: 'Rwanda Development Board',
      publishedAt: normalizeDate(post.date_gmt ?? post.date),
    });
  });

  const filtered = mapped.filter((doc) =>
    matchesAdvisoryFocus(doc.title, doc.content ?? ''),
  );
  const prioritized = filtered.length > 0 ? filtered : mapped;

  prioritized.sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });

  return prioritized.slice(0, limit);
};
