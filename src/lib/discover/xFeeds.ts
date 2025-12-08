import { XMLParser } from 'fast-xml-parser';
import type { DiscoverArticle } from '@/lib/types/discover';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
});

const FALLBACK_NITTER_BASES = (
  process.env.NITTER_BASE_URL ? [process.env.NITTER_BASE_URL] : []
).concat([
  'https://nitter.privacyredirect.com',
  'https://nitter.pufe.org',
  'https://nitter.net',
]);

const handleThumbnail = (handle: string) =>
  `https://unavatar.io/twitter/${encodeURIComponent(handle)}`;

const sanitizeUrl = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const parsed = new URL(value, 'https://x.com/');
    return parsed.toString();
  } catch (err) {
    return undefined;
  }
};

const decodeHtml = (value?: string | null) => {
  if (!value) return '';
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
};

const stripTags = (value?: string | null) => {
  if (!value) return '';
  return value.replace(/<[^>]+>/g, '').trim();
};

const normalizeDate = (value?: string | null) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const toCanonicalTweetUrl = (link?: string | null, handle?: string) => {
  if (!link) return undefined;
  try {
    const url = new URL(link);
    const segments = url.pathname.split('/').filter(Boolean);
    const statusIndex = segments.findIndex((segment) => segment === 'status');
    if (statusIndex === -1 || statusIndex === segments.length - 1) {
      return link;
    }
    const tweetId = segments[statusIndex + 1];
    const username = segments[statusIndex - 1] || handle;
    if (!tweetId || !username) {
      return link;
    }
    return `https://x.com/${username}/status/${tweetId}`;
  } catch (err) {
    return link;
  }
};

const toAccessibleTweetUrl = (canonicalUrl?: string) => {
  if (!canonicalUrl) return undefined;
  return `https://r.jina.ai/${canonicalUrl}`;
};

const resolveEmbeddedImage = (descriptionHtml?: string | null) => {
  if (!descriptionHtml) return undefined;

  const imgMatch = descriptionHtml.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
  if (imgMatch) {
    return sanitizeUrl(imgMatch[1]);
  }

  const dataSrcMatch = descriptionHtml.match(/data-src="([^"]+)"/i);
  if (dataSrcMatch) {
    return sanitizeUrl(dataSrcMatch[1]);
  }

  return undefined;
};

const resolveMediaUrl = (item: Record<string, any>) => {
  const enclosureUrl = sanitizeUrl(item.enclosure?.url || item.enclosure?.text);
  if (enclosureUrl) return enclosureUrl;

  const mediaContent = item['media:content'] ?? item['media:thumbnail'];
  const mediaUrl = sanitizeUrl(mediaContent?.url || mediaContent?.text);
  if (mediaUrl) return mediaUrl;

  const descriptionHtml = item.description?.text || item.description;
  return resolveEmbeddedImage(descriptionHtml);
};

export const fetchXTimeline = async (
  handle: string,
  displayName: string,
  limit = 10,
): Promise<DiscoverArticle[]> => {
  for (const base of FALLBACK_NITTER_BASES) {
    const normalizedBase = base.replace(/\/$/, '');
    const rssUrl = `${normalizedBase}/${handle}/rss`;
    try {
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Perplexica/1.0 (Updates & Alerts Timeline)',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (!response.ok) {
        console.warn(
          `fetchXTimeline: failed to fetch @${handle} from ${normalizedBase} (status ${response.status})`,
        );
        continue;
      }

      const xml = await response.text();
      const parsed = xmlParser.parse(xml);
      const channelItems = parsed?.rss?.channel?.item;
      const items = Array.isArray(channelItems)
        ? channelItems
        : channelItems
          ? [channelItems]
          : [];
      if (!items.length) continue;

      const normalized: DiscoverArticle[] = [];
      for (const item of items.slice(0, limit)) {
        const title =
          decodeHtml(stripTags(item.title?.text || item.title)) ||
          `${displayName} update`;
        const description = decodeHtml(
          stripTags(item.description?.text || item.description),
        );
        const canonicalUrl = toCanonicalTweetUrl(
          (item.link?.text || item.link)?.trim(),
          handle,
        );
        if (!canonicalUrl) continue;
        const accessibleUrl = toAccessibleTweetUrl(canonicalUrl) ?? canonicalUrl;
        const body = description || title;
        const annotatedBody =
          canonicalUrl !== accessibleUrl
            ? `${body}\n\nOriginal: ${canonicalUrl}`
            : body;

        const mediaThumbnail = resolveMediaUrl(item);

        normalized.push({
          title,
          content: annotatedBody,
          url: accessibleUrl,
          thumbnail: mediaThumbnail ?? handleThumbnail(handle),
          source: displayName,
          publishedAt: normalizeDate(item.pubDate?.text || item.pubDate),
        });
      }

      if (normalized.length) {
        return normalized;
      }
    } catch (err) {
      console.warn(`fetchXTimeline: error fetching @${handle} from ${normalizedBase}`, err);
    }
  }

  return [];
};
