import { HTMLElement, parse } from 'node-html-parser';
import { normalizeGlyphs } from '@/lib/discover/utils';
import logger from '@/lib/logger';
import type { DiscoverArticle } from '@/lib/types/discover';

const RRA_BASE_URL = 'https://www.rra.gov.rw';
const RRA_NEWS_URL = `${RRA_BASE_URL}/en/about-us/news-events`;

const DATE_REGEX = /(\d{2})\.(\d{2})\.(\d{4})/;

const absolutize = (url: string | undefined | null) => {
  if (!url) return undefined;
  try {
    return new URL(url, RRA_BASE_URL).toString();
  } catch (err) {
    return undefined;
  }
};

const extractDate = (node: HTMLElement) => {
  const match = node.text.replace(/\s+/g, ' ').match(DATE_REGEX);
  if (!match) return undefined;

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}T00:00:00.000Z`;
  return iso;
};

const extractSummary = (node: HTMLElement) => {
  const summaryNode =
    node.querySelector('.lead') ||
    node.querySelector('.txt_content.txt_grey') ||
    node.querySelector('p');

  return summaryNode?.text.trim() ?? '';
};

const extractThumbnail = (node: HTMLElement) => {
  const imgInNode = node.querySelector('img');
  if (imgInNode) {
    return absolutize(imgInNode.getAttribute('src'));
  }

  const parent = node.parentNode as HTMLElement | null;
  const siblingImage = parent?.previousElementSibling?.querySelector('img');
  if (siblingImage) {
    return absolutize(siblingImage.getAttribute('src'));
  }

  return undefined;
};

const rraNewsLogger = logger.withDefaults({ tag: 'discover:rra-news' });

export const fetchRraNewsArticles = async (
  limit = 30,
): Promise<DiscoverArticle[]> => {
  let response: Response;

  try {
    response = await fetch(RRA_NEWS_URL, {
      headers: {
        'User-Agent': 'Perplexica/1.0 (RRA Focus Mode)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (error) {
    rraNewsLogger.error('Failed to fetch RRA News & Events page.', {
      error,
      url: RRA_NEWS_URL,
    });
    return [];
  }

  if (!response.ok) {
    rraNewsLogger.warn('RRA News & Events page returned non-success status.', {
      status: response.status,
      statusText: response.statusText,
      url: RRA_NEWS_URL,
    });
    return [];
  }

  const html = await response.text();
  const root = parse(html, {
    lowerCaseTagName: true,
  });
  const articleNodes = root.querySelectorAll('.newscontent, .newscontent2');

  const deduped: DiscoverArticle[] = [];
  const seen = new Set<string>();

  for (const node of articleNodes) {
    const anchorCandidates = node.querySelectorAll('a[href*="/en/details"]');
    if (!anchorCandidates.length) continue;

    const link =
      anchorCandidates.find((candidate) => {
        const text = candidate.text.replace(/\s+/g, ' ').trim();
        return text.length > 0;
      }) ?? anchorCandidates[0];

    const url = absolutize(link.getAttribute('href'));
    if (!url || seen.has(url)) continue;

    seen.add(url);

    const title =
      link.text.replace(/\s+/g, ' ').trim() ||
      link.getAttribute('title')?.trim() ||
      'Untitled';
    const summary = extractSummary(node);
    const publishedAt = extractDate(node);
    const thumbnail = extractThumbnail(node);

    deduped.push({
      title,
      content: summary,
      url,
      thumbnail,
      source: 'Rwanda Revenue Authority',
      publishedAt,
    });

    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped.map((article) => ({
    ...article,
    title: normalizeGlyphs(article.title) ?? article.title,
    content: normalizeGlyphs(article.content) ?? article.content,
  }));
};
