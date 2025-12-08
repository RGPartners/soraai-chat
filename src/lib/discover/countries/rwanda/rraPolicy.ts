import { HTMLElement, parse } from 'node-html-parser';
import type { DiscoverArticle } from '@/lib/types/discover';

const RRA_BASE_URL = 'https://www.rra.gov.rw';
const RRA_PUBLICATIONS_URL = `${RRA_BASE_URL}/en/publications`;
const TARGET_CARD_TEXT = 'international agreements';

const absolutize = (href: string | undefined | null) => {
  if (!href) return undefined;
  try {
    return new URL(href, RRA_BASE_URL).toString();
  } catch (err) {
    return undefined;
  }
};

const fetchHtml = async (url: string, label: string) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Perplexica/1.0 (Policy & Legislation)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}. Status: ${response.status}`);
  }

  return response.text();
};

const findInternationalAgreementUrl = (root: HTMLElement) => {
  const links = root.querySelectorAll('a');
  for (const link of links) {
    const text = link.text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!text.includes(TARGET_CARD_TEXT)) continue;
    const href = link.getAttribute('href');
    const absolute = absolutize(href);
    if (absolute) {
      return absolute;
    }
  }

  return undefined;
};

const extractPolicyDocuments = (
  root: HTMLElement,
  limit: number,
): DiscoverArticle[] => {
  const contentNode =
    root.querySelector('.news-text-wrap') || root.querySelector('.txt_content');
  if (!contentNode) return [];

  const docs: DiscoverArticle[] = [];
  const seen = new Set<string>();

  for (const anchor of contentNode.querySelectorAll('a')) {
    const title = anchor.text.replace(/\s+/g, ' ').trim();
    const href = anchor.getAttribute('href');
    const url = absolutize(href);

    if (!title || !url || seen.has(url)) continue;
    seen.add(url);

    docs.push({
      title,
      content: title,
      url,
      source: 'Rwanda Revenue Authority',
    });

    if (docs.length >= limit) {
      break;
    }
  }

  return docs;
};

export const fetchRraPolicyDocuments = async (
  limit = 30,
): Promise<DiscoverArticle[]> => {
  const publicationsHtml = await fetchHtml(
    RRA_PUBLICATIONS_URL,
    'RRA Publications page',
  );
  const publicationsRoot = parse(publicationsHtml, {
    lowerCaseTagName: true,
  });

  const detailUrl = findInternationalAgreementUrl(publicationsRoot);
  if (!detailUrl) {
    throw new Error('Failed to locate International Agreements link.');
  }

  const detailHtml = await fetchHtml(detailUrl, 'RRA International Agreements');
  const detailRoot = parse(detailHtml, {
    lowerCaseTagName: true,
  });

  return extractPolicyDocuments(detailRoot, limit);
};
