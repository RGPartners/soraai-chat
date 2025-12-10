import { HTMLElement, parse } from 'node-html-parser';
import { normalizeGlyphs } from '@/lib/discover/utils';
import logger from '@/lib/logger';
import type { DiscoverArticle } from '@/lib/types/discover';

const MINFIN_BASE_URL = 'https://www.minecofin.gov.rw';
const MINFIN_NEWS_URL = `${MINFIN_BASE_URL}/news`;

const absolutize = (href: string | undefined | null) => {
  if (!href) return undefined;
  try {
    return new URL(href, MINFIN_BASE_URL).toString();
  } catch (err) {
    return undefined;
  }
};

const getText = (node?: HTMLElement | null) =>
  node?.text.replace(/\s+/g, ' ').trim() ?? '';

const extractPublishedAt = (container: HTMLElement) => {
  const timeNode = container.querySelector('time');
  const explicitDatetime = timeNode?.getAttribute('datetime');
  if (explicitDatetime) {
    const date = new Date(explicitDatetime);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const textual = getText(timeNode);
  if (!textual) return undefined;
  const normalized = Date.parse(textual);
  if (!Number.isNaN(normalized)) {
    return new Date(normalized).toISOString();
  }

  return undefined;
};

const extractSummary = (container: HTMLElement) => {
  const leadNode =
    container.querySelector('.lead') || container.querySelector('.txt_content');
  const raw = getText(leadNode);
  return raw;
};

const minfinNewsLogger = logger.withDefaults({ tag: 'discover:minfin-news' });

export const fetchMinfinPolicyArticles = async (
  limit = 20,
): Promise<DiscoverArticle[]> => {
  let response: Response;

  try {
    response = await fetch(MINFIN_NEWS_URL, {
      headers: {
        'User-Agent': 'Perplexica/1.0 (Policy & Legislation)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (error) {
    minfinNewsLogger.error('Failed to fetch Minecofin news listing.', {
      error,
      url: MINFIN_NEWS_URL,
    });
    return [];
  }

  if (!response.ok) {
    minfinNewsLogger.warn('Minecofin news listing returned non-success status.', {
      status: response.status,
      statusText: response.statusText,
      url: MINFIN_NEWS_URL,
    });
    return [];
  }

  const html = await response.text();
  const root = parse(html, {
    lowerCaseTagName: true,
  });

  const articleWrappers = root.querySelectorAll('.articletype-0');
  const articles: DiscoverArticle[] = [];
  const seen = new Set<string>();

  for (const wrapper of articleWrappers) {
    const link = wrapper.querySelector('a[href*="/news-detail"]');
    if (!link) continue;

    const url = absolutize(link.getAttribute('href'));
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const titleNode = wrapper.querySelector('h3') || link;
    const title = getText(titleNode) || 'Untitled';
    const content = extractSummary(wrapper);
    const imageNode =
      wrapper.querySelector('img') ||
      ((wrapper.parentNode as HTMLElement | null)?.querySelector('img') ?? null);
    const thumbnail = absolutize(imageNode?.getAttribute('src'));
    const publishedAt = extractPublishedAt(wrapper);

    articles.push({
      title,
      content,
      url,
      thumbnail,
      source: 'Ministry of Finance and Economic Planning',
      publishedAt,
    });

    if (articles.length >= limit) {
      break;
    }
  }

  return articles.map((article) => ({
    ...article,
    title: normalizeGlyphs(article.title) ?? article.title,
    content: normalizeGlyphs(article.content) ?? article.content,
  }));
};
