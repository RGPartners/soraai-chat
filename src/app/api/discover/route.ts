import { getSessionFromRequest } from '@/lib/auth/session';
import { searchSearxng } from '@/lib/searxng';
import { CacheKeys, serverCache } from '@/lib/cache';
import { createRateLimiter } from '@/lib/rate-limit';
import logger from '@/lib/logger';
import {
  defaultDiscoverTopicKey,
  getCountryAwareTopic,
} from '@/lib/discover/topics';
import { getCountryTopicPipeline } from '@/lib/discover/topicPipelines';
import { includesTaxKeyword, getHost, getPublishedTimestamp } from '@/lib/discover/utils';
import type { DiscoverArticle, DiscoverFeedResponse } from '@/lib/types/discover';

const DISCOVER_CACHE_TTL_MS = 5 * 60 * 1000;
const DISCOVER_PREVIEW_CACHE_TTL_MS = 60 * 1000;

const discoverRateLimiter = createRateLimiter({
  keyPrefix: 'ratelimit:discover',
  requests: 20,
  window: '5 m',
  mode: 'sliding',
});

const discoverLogger = logger.withDefaults({ tag: 'api:discover' });

const pickThumbnail = (item: any) =>
  item.thumbnail || item.thumbnail_src || item.thumbnail_url || item.img_src;

const normalizeArticle = (item: any): DiscoverArticle | null => {
  const thumbnail = pickThumbnail(item);
  if (!item.url) return null;

  const publishedAt = item.published || item.publishedDate || item.date;

  return {
    title: item.title ?? 'Untitled',
    content: item.content ?? item.description ?? '',
    url: item.url,
    thumbnail,
    source: item.source ?? getHost(item.url),
    publishedAt,
  };
};

const normalizeDomainString = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./, '').toLowerCase();
  } catch (err) {
    return trimmed.replace(/^www\./, '').split('/')[0].toLowerCase();
  }
};

const getArticleDomainKey = (
  article: DiscoverArticle,
  priorityDomains: string[],
) => {
  const host = (article.source ?? getHost(article.url) ?? '').toLowerCase();
  if (!host) return 'unknown';
  const matched = priorityDomains.find(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
  return matched ?? host;
};

const absolutizeUrl = (maybeRelative: string, base: string) => {
  try {
    return new URL(maybeRelative, base).toString();
  } catch (err) {
    return maybeRelative;
  }
};

const ogImageCache = new Map<string, string>();

const fetchOgImage = async (articleUrl: string) => {
  if (ogImageCache.has(articleUrl)) {
    return ogImageCache.get(articleUrl);
  }

  try {
    const res = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Perplexica/1.0 (Discover Thumbnail Enricher)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return undefined;

    const html = await res.text();
    const root = await import('node-html-parser').then(({ parse }) =>
      parse(html, {
        lowerCaseTagName: true,
      }),
    );

    const selectors = [
      'meta[property="og:image"]',
      'meta[property="og:image:url"]',
      'meta[name="og:image"]',
      'meta[name="og:image:url"]',
      'meta[name="twitter:image"]',
      'meta[property="twitter:image"]',
    ];

    for (const selector of selectors) {
      const node = root.querySelector(selector);
      const content = node?.getAttribute('content');
      if (content) {
        const normalized = absolutizeUrl(content, articleUrl);
        ogImageCache.set(articleUrl, normalized);
        return normalized;
      }
    }
  } catch (err) {
    console.warn(`discover route: failed to fetch og:image for ${articleUrl}`, err);
  }

  return undefined;
};

const enrichNewTimesThumbnails = async (articles: DiscoverArticle[]) => {
  const enrichTargets = articles.filter((article) => {
    const host = getHost(article.url);
    return (
      (!article.thumbnail || article.thumbnail.trim() === '') &&
      Boolean(host && host.endsWith('newtimes.co.rw'))
    );
  });

  await Promise.all(
    enrichTargets.map(async (article) => {
      const ogImage = await fetchOgImage(article.url);
      if (ogImage) {
        article.thumbnail = ogImage;
      }
    }),
  );
};

const balanceArticlesByDomain = (
  articles: DiscoverArticle[],
  priorityDomains: string[],
  limit: number,
) => {
  const buckets = new Map<string, DiscoverArticle[]>();
  const domainOrder: string[] = [];

  const baseOrder = Array.from(new Set(priorityDomains.filter(Boolean)));

  articles.forEach((article) => {
    const key = getArticleDomainKey(article, baseOrder);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      if (baseOrder.includes(key)) {
        domainOrder.push(key);
      } else {
        domainOrder.push(key);
      }
    }
    buckets.get(key)!.push(article);
  });

  const rotation = Array.from(
    new Set([
      ...baseOrder.filter((domain) => buckets.has(domain)),
      ...domainOrder.filter((domain) => !baseOrder.includes(domain)),
    ]),
  );

  const balanced: DiscoverArticle[] = [];
  let progress = true;
  while (balanced.length < limit && progress) {
    progress = false;
    for (const domain of rotation) {
      const bucket = buckets.get(domain);
      if (!bucket || bucket.length === 0) continue;
      balanced.push(bucket.shift()!);
      progress = true;
      if (balanced.length === limit) break;
    }
  }

  if (balanced.length < limit) {
    for (const domain of rotation) {
      const bucket = buckets.get(domain);
      while (bucket && bucket.length && balanced.length < limit) {
        balanced.push(bucket.shift()!);
      }
      if (balanced.length >= limit) break;
    }
  }

  return balanced;
};

const filterTopicArticles = (
  items: any[],
  topicKeywords: string[] | undefined,
  includeBaseKeywords: boolean | undefined,
) => {
  const normalized = items
    .map(normalizeArticle)
    .filter((article): article is DiscoverArticle => Boolean(article));

  if (!topicKeywords?.length && includeBaseKeywords === false) {
    return normalized;
  }

  return normalized.filter((article) =>
    includesTaxKeyword(
      `${article.title} ${article.content}`,
      topicKeywords ?? [],
      { includeBase: includeBaseKeywords !== false },
    ),
  );
};

export const GET = async (req: Request) => {
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const params = new URL(req.url).searchParams;

    const mode: 'normal' | 'preview' =
      (params.get('mode') as 'normal' | 'preview') || 'normal';
    const requestedTopicKey = params.get('topic') || defaultDiscoverTopicKey;
    const requestedCountry = params.get('country')?.toLowerCase().trim();

    const limiterState = await discoverRateLimiter.limit(session.user.id);
    const headers = new Headers();

    if (Number.isFinite(limiterState.limit)) {
      headers.set('X-RateLimit-Limit', limiterState.limit.toString());
      headers.set('X-RateLimit-Remaining', Math.max(limiterState.remaining, 0).toString());
      headers.set('X-RateLimit-Reset', limiterState.reset.toString());
    }

    if (!limiterState.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil(limiterState.retryAfterMs / 1000));
      headers.set('Retry-After', retryAfterSeconds.toString());

      return Response.json(
        { message: 'Too many discover requests. Please try again later.' },
        { status: 429, headers },
      );
    }

    const { topic, appliedCountry } = getCountryAwareTopic(
      requestedTopicKey,
      requestedCountry,
    );

    const pipeline = getCountryTopicPipeline(appliedCountry, topic.key);
    const cacheKey = CacheKeys.discover(topic.key, mode, appliedCountry ?? undefined);
    const cached = await serverCache.get<DiscoverFeedResponse>(cacheKey);

    if (cached) {
      headers.set('X-Cache', 'HIT');
      return Response.json(cached, { status: 200, headers });
    }

    const engines = topic.engines && topic.engines.length > 0 ? topic.engines : ['bing news'];
    const language = topic.language ?? 'en';
    const resultLimit = topic.resultLimit ?? 30;

    let articles: DiscoverArticle[] = [];

    if (pipeline) {
      articles = await pipeline({ resultLimit });
    } else {
      const domains = topic.domains ?? [];
      const queries = topic.queries ?? [];
      const combos = domains.flatMap((domain) =>
        queries.map((query) => ({
          domain,
          query,
        })),
      );

      let rawResults: any[] = [];

      if (combos.length === 0) {
        rawResults = [];
      } else if (mode === 'normal') {
        const resultSets = await Promise.all(
          combos.map(async ({ domain, query }) => {
            try {
              const response = await searchSearxng(`site:${domain} ${query}`, {
                engines,
                pageno: 1,
                language,
              });
              return response.results;
            } catch (err) {
              console.error(
                `discover route: failed query for ${domain} with "${query}": ${err}`,
              );
              return [];
            }
          }),
        );
        rawResults = resultSets.flat();
      } else {
        const random = combos[Math.floor(Math.random() * combos.length)];
        const response = await searchSearxng(
          `site:${random.domain} ${random.query}`,
          {
            engines,
            pageno: 1,
            language,
          },
        );
        rawResults = response.results;
      }

      const seenUrls = new Set<string>();
      const filtered = filterTopicArticles(
        rawResults,
        topic.keywords,
        topic.includeBaseKeywords,
      ).filter((item) => {
        const normalizedUrl = item.url.toLowerCase().trim();
        if (seenUrls.has(normalizedUrl)) return false;
        seenUrls.add(normalizedUrl);
        return true;
      });

      const prioritizedDomains = (topic.domains ?? [])
        .map((domain) => normalizeDomainString(domain))
        .filter((domain): domain is string => Boolean(domain));
      articles = balanceArticlesByDomain(filtered, prioritizedDomains, resultLimit);

      if (appliedCountry === 'rwanda' && topic.key === 'entertainment') {
        await enrichNewTimesThumbnails(articles);
      }
    }

    const uniqueUrls = new Set<string>();
    articles = articles.filter((article) => {
      const key = article.url.toLowerCase().trim();
      if (uniqueUrls.has(key)) return false;
      uniqueUrls.add(key);
      return true;
    });

    articles.sort(
      (a, b) => getPublishedTimestamp(b.publishedAt) - getPublishedTimestamp(a.publishedAt),
    );

    const payload: DiscoverFeedResponse = {
      blogs: articles.slice(0, resultLimit),
      topic: {
        key: topic.key,
        label: topic.label,
        description: topic.description,
      },
      lastUpdated: new Date().toISOString(),
      country: appliedCountry ?? 'global',
    };

    const ttl =
      mode === 'preview' ? DISCOVER_PREVIEW_CACHE_TTL_MS : DISCOVER_CACHE_TTL_MS;

    await serverCache.set(cacheKey, payload, ttl);

    headers.set('X-Cache', 'MISS');

    return Response.json(payload, { status: 200, headers });
  } catch (err) {
    discoverLogger.error('Failed to resolve discover feed.', err);
    return Response.json(
      {
        message: 'An error has occurred',
      },
      {
        status: 500,
      },
    );
  }
};
