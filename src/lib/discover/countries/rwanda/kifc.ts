import { HTMLElement, parse } from 'node-html-parser';
import { normalizeGlyphs } from '@/lib/discover/utils';
import type { DiscoverArticle } from '@/lib/types/discover';

const KIFC_BASE_URL = 'https://kifc.rw';
const KIFC_NEWS_URL = `${KIFC_BASE_URL}/news/`;
const KIFC_EVENTS_URL = `${KIFC_BASE_URL}/events-financial-conferences-and-summits/`;
const KIFC_RESOURCES_URL = `${KIFC_BASE_URL}/resources/`;
const KIFC_MEDIA_ENDPOINT = `${KIFC_BASE_URL}/wp-json/wp/v2/media`;
const MEDIA_PAGE_SIZE = 60;
const MEDIA_KEYWORDS = [
  'law',
  'legal',
  'regulation',
  'policy',
  'tax',
  'compliance',
  'framework',
  'report',
  'bulletin',
  'alert',
  'investment',
  'annual',
  'data protection',
  'sustainable',
  'kifc',
];
const MEDIA_EXCLUDE = ['photo', 'image', 'logo', 'invitation', 'banner'];
const ADVISORY_KEYWORDS = [
  'investment',
  'advisory',
  'planning',
  'strategy',
  'structuring',
  'wealth',
  'capital',
  'finance',
  'tax',
  'optimization',
];

type KifcMediaItem = {
  id: number;
  date?: string;
  date_gmt?: string;
  title?: { rendered?: string };
  caption?: { rendered?: string };
  description?: { rendered?: string };
  media_type?: string;
  mime_type?: string;
  source_url?: string;
};

const normalizeUrl = (maybeRelative?: string | null) => {
  if (!maybeRelative) return undefined;
  try {
    return new URL(maybeRelative, KIFC_BASE_URL).toString();
  } catch (err) {
    return undefined;
  }
};

const extractText = (node?: HTMLElement | null) =>
  node?.text.replace(/\s+/g, ' ').trim() ?? '';

const htmlToText = (value?: string | null) => {
  if (!value) return '';
  return parse(value, {
    lowerCaseTagName: true,
  })
    .text.replace(/\s+/g, ' ')
    .trim();
};

const parseDate = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const isoLike = Date.parse(trimmed);
  if (!Number.isNaN(isoLike)) {
    return new Date(isoLike).toISOString();
  }

  const monthDayMatch = trimmed.match(/([A-Za-z]{3,})\s+(\d{1,2})/);
  if (monthDayMatch) {
    const [, monthName, day] = monthDayMatch;
    const yearMatch = trimmed.match(/(20\d{2})/);
    const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
    const parsed = Date.parse(`${monthName} ${day} ${year}`);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return undefined;
};

const sanitizeThumbnail = (raw?: string | null) => {
  if (!raw) return undefined;
  const url = normalizeUrl(raw);
  if (!url) return undefined;
  const parsed = new URL(url);
  parsed.searchParams.delete('resize');
  parsed.searchParams.delete('quality');
  return parsed.toString();
};

const extractBackgroundImageMap = (html: string) => {
  const map = new Map<string, string>();
  const regex = /\.e-loop-item-(\d+)[^}]*background-image\s*:\s*url\((?:"|')?([^"')]+)(?:"|')?\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const [, id, url] = match;
    map.set(`e-loop-item-${id}`, url);
  }
  return map;
};

const dedupeArticles = (items: DiscoverArticle[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const matchesAdvisoryFocus = (article: DiscoverArticle) => {
  const haystack = `${article.title} ${(article.content ?? '').toString()}`.toLowerCase();
  return ADVISORY_KEYWORDS.some((keyword) => haystack.includes(keyword));
};

const fetchHtml = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Perplexica/1.0 (KIFC Discover)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!res.ok) {
    throw new Error(`Unable to fetch ${url} status=${res.status}`);
  }

  return res.text();
};

const fetchJson = async <T>(url: string, label: string): Promise<T> => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Perplexica/1.0 (KIFC Discover)',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Unable to fetch ${label} status=${res.status}`);
  }

  return res.json() as Promise<T>;
};

const looksRelevantDocument = (value: string) => {
  const haystack = value.toLowerCase();
  if (MEDIA_EXCLUDE.some((needle) => haystack.includes(needle))) {
    return false;
  }
  return MEDIA_KEYWORDS.some((needle) => haystack.includes(needle));
};

const extractResourceCategory = (classAttr?: string | null) => {
  if (!classAttr) return undefined;
  const slug = classAttr
    .split(/\s+/)
    .find((token) => token.startsWith('resource_categories-'));
  if (!slug) return undefined;
  const readable = slug
    .replace('resource_categories-', '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return readable || undefined;
};

const fetchKifcResourcesPageDocuments = async (limit: number) => {
  const html = await fetchHtml(KIFC_RESOURCES_URL);
  const root = parse(html, {
    lowerCaseTagName: true,
  });

  const cards = root.querySelectorAll('.elementor-loop-container .e-loop-item');
  const docs: DiscoverArticle[] = [];
  const seen = new Set<string>();

  for (const card of cards) {
    const link = card.querySelector('a.elementor-icon') ?? card.querySelector('a');
    const href = normalizeUrl(link?.getAttribute('href'));
    if (!href || !href.toLowerCase().endsWith('.pdf')) continue;
    if (seen.has(href)) continue;
    seen.add(href);

    const title = extractText(card.querySelector('.elementor-heading-title') ?? link);
    if (!title) continue;

    const category = extractResourceCategory(card.getAttribute('class'));
    const content = category ? `${title} (${category})` : title;

    docs.push({
      title,
      content,
      url: href,
      source: 'Kigali International Financial Centre',
    });

    if (docs.length >= limit) break;
  }

  return docs.map((doc) => ({
    ...doc,
    title: normalizeGlyphs(doc.title) ?? doc.title,
    content: normalizeGlyphs(doc.content) ?? doc.content,
  }));
};

const fetchKifcMediaDocuments = async (limit: number) => {
  const perPage = Math.min(Math.max(limit * 3, MEDIA_PAGE_SIZE), 100);
  const params = new URLSearchParams({
    media_type: 'application',
    mime_type: 'application/pdf',
    per_page: String(perPage),
    orderby: 'date',
    order: 'desc',
  });
  const url = `${KIFC_MEDIA_ENDPOINT}?${params.toString()}`;
  const items = await fetchJson<KifcMediaItem[]>(url, 'KIFC media entries');

  const docs: DiscoverArticle[] = [];

  for (const item of items) {
    if (!item?.source_url || item.media_type !== 'application') continue;
    const title = htmlToText(item.title?.rendered) || 'KIFC Publication';
    const description = htmlToText(
      item.caption?.rendered || item.description?.rendered || title,
    );
    const haystack = `${title} ${description}`.trim();
    if (!haystack || !looksRelevantDocument(haystack)) continue;

    docs.push({
      title,
      content: description || title,
      url: item.source_url,
      source: 'Kigali International Financial Centre',
      publishedAt: parseDate(item.date_gmt ?? item.date),
    });

    if (docs.length >= limit) break;
  }

  return docs.map((doc) => ({
    ...doc,
    title: normalizeGlyphs(doc.title) ?? doc.title,
    content: normalizeGlyphs(doc.content) ?? doc.content,
  }));
};

export const fetchKifcPolicyDocuments = async (limit = 30): Promise<DiscoverArticle[]> => {
  const [resourceDocs, mediaDocs] = await Promise.all([
    fetchKifcResourcesPageDocuments(limit),
    fetchKifcMediaDocuments(limit),
  ]);

  const combined = [...resourceDocs, ...mediaDocs];
  const seen = new Set<string>();
  const deduped: DiscoverArticle[] = [];

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
  return sliced.map((doc) => ({
    ...doc,
    title: normalizeGlyphs(doc.title) ?? doc.title,
    content: normalizeGlyphs(doc.content) ?? doc.content,
  }));
};

export const fetchKifcNews = async (limit = 24): Promise<DiscoverArticle[]> => {
  const html = await fetchHtml(KIFC_NEWS_URL);
  const root = parse(html, {
    lowerCaseTagName: true,
  });

  const articles = root.querySelectorAll('article.elementor-post');
  const mapped: DiscoverArticle[] = [];

  for (const article of articles) {
    const link =
      article.querySelector('a.elementor-post__read-more, a.elementor-post__title') ??
      article.querySelector('a');
    if (!link) continue;

    const href = normalizeUrl(link.getAttribute('href'));
    if (!href) continue;

    const titleNode = article.querySelector('.elementor-post__title') ?? link;
    const title = extractText(titleNode);
    if (!title) continue;

    const summary = extractText(
      article.querySelector('.elementor-post__excerpt') ?? article.querySelector('p'),
    );
    const date = parseDate(article.querySelector('.elementor-post-date')?.text ?? undefined);
    const thumbnail = sanitizeThumbnail(
      article.querySelector('.elementor-post__thumbnail img')?.getAttribute('src') ??
        article.querySelector('img')?.getAttribute('src'),
    );

    mapped.push({
      title,
      content: summary,
      url: href,
      thumbnail,
      source: 'Kigali International Financial Centre',
      publishedAt: date,
    });

    if (mapped.length >= limit) break;
  }

  return dedupeArticles(mapped).map((doc) => ({
    ...doc,
    title: normalizeGlyphs(doc.title) ?? doc.title,
    content: normalizeGlyphs(doc.content) ?? doc.content,
  }));
};

export const fetchKifcEvents = async (limit = 24): Promise<DiscoverArticle[]> => {
  const html = await fetchHtml(KIFC_EVENTS_URL);
  const root = parse(html, {
    lowerCaseTagName: true,
  });
  const backgroundImages = extractBackgroundImageMap(html);

  const eventCards = root.querySelectorAll(
    '.elementor-loop-container .e-loop-item, article.elementor-post',
  );
  const mapped: DiscoverArticle[] = [];

  for (const card of eventCards) {
    const link = card.querySelector('a');
    const href = normalizeUrl(link?.getAttribute('href'));
    if (!href) continue;

    const titleNode =
      card.querySelector('.elementor-heading-title, h3, h2, .elementor-post__title') ?? link;
    const title = extractText(titleNode);
    if (!title) continue;

    const summary = extractText(card.querySelector('p'));

    let dateText: string | undefined;
    const dateNode = card.querySelector(
      '.elementor-icon-list-text, .elementor-heading-title span, .date',
    );
    if (dateNode) {
      dateText = dateNode.text;
    }

    const publishedAt = parseDate(dateText);

    const classNames = card.getAttribute('class')?.split(/\s+/) ?? [];
    const classMatch = classNames.find((className: string) => className.startsWith('e-loop-item-'));
    const backgroundSrc = classMatch ? backgroundImages.get(classMatch) : undefined;
    const imageSrc =
      card.querySelector('img')?.getAttribute('src') ?? backgroundSrc;
    const thumbnail = sanitizeThumbnail(imageSrc);

    mapped.push({
      title,
      content: summary,
      url: href,
      thumbnail,
      source: 'Kigali International Financial Centre',
      publishedAt,
    });

    if (mapped.length >= limit) break;
  }

  return dedupeArticles(mapped).map((doc) => ({
    ...doc,
    title: normalizeGlyphs(doc.title) ?? doc.title,
    content: normalizeGlyphs(doc.content) ?? doc.content,
  }));
};

export const fetchKifcAdvisoryInsights = async (
  limit = 24,
): Promise<DiscoverArticle[]> => {
  const rawArticles = await fetchKifcNews(Math.max(limit * 2, 24));
  const filtered = rawArticles.filter(matchesAdvisoryFocus);
  const prioritized = filtered.length > 0 ? filtered : rawArticles;
  return prioritized.slice(0, limit);
};
