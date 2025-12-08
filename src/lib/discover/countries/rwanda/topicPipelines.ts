import type { TopicPipelineResolver } from '@/lib/discover/topicPipelines';
import { fetchBnrRegulatoryFrameworks } from '@/lib/discover/countries/rwanda/bnrPolicy';
import { fetchMinfinPolicyArticles } from '@/lib/discover/countries/rwanda/minfinNews';
import { fetchRdbAdvisoryInsights } from '@/lib/discover/countries/rwanda/rdbAdvisory';
import { fetchRdbPolicyDocuments } from '@/lib/discover/countries/rwanda/rdbPolicy';
import { fetchRraNewsArticles } from '@/lib/discover/countries/rwanda/rraNews';
import { fetchRraPolicyDocuments } from '@/lib/discover/countries/rwanda/rraPolicy';
import {
  fetchKifcAdvisoryInsights,
  fetchKifcPolicyDocuments,
} from '@/lib/discover/countries/rwanda/kifc';
import { roundRobinCombineByUrl } from '@/lib/discover/roundRobinCombineByUrl';
import { fetchXTimeline } from '@/lib/discover/xFeeds';
import {
  dedupeByThumbnail,
  filterDiscoverEntries,
  filterOutDiscoverEntries,
  getHost,
  getPublishedTimestamp,
  normalizeGlyphs,
  resolveDiscoverThumbnail,
} from '@/lib/discover/utils';
import type { DiscoverArticle } from '@/lib/types/discover';

const RWANDA_ALERT_HANDLES = [
  { handle: 'rrainfo', label: 'RRA (X)' },
  { handle: 'RwandaFinance', label: 'Rwanda Finance (X)' },
  { handle: 'CentralBankRw', label: 'National Bank of Rwanda (X)' },
];

const sortByPublishedDate = (items: DiscoverArticle[]) =>
  items.sort(
    (a, b) => getPublishedTimestamp(b.publishedAt) - getPublishedTimestamp(a.publishedAt),
  );

const COMPLIANCE_KEYWORDS = [
  'compliance',
  'enforcement',
  'audit',
  'penalty',
  'obligation',
  'deadline',
  'ebm',
  'inspection',
];

const ALERT_KEYWORDS = [
  'alert',
  'notice',
  'deadline',
  'reminder',
  'urgent',
  'press',
  'briefing',
  'announcement',
];

const REGULATION_FOCUS_KEYWORDS = [
  'policy',
  'strategy',
  'framework',
  'law',
  'bill',
  'directive',
  'guideline',
  'gazette',
  'regulation',
  'charter',
  'reform',
];

const REGULATION_EXCLUDE_KEYWORDS = [
  ...COMPLIANCE_KEYWORDS,
  ...ALERT_KEYWORDS,
  'reminder',
  'penalty',
];

const TAX_UPDATE_KEYWORDS = [
  'update',
  'brief',
  'newsletter',
  'bulletin',
  'report',
  'statistics',
  'performance',
  'revenue',
  'collection',
  'highlights',
  'summary',
  'announcement',
  'dashboard',
  'figures',
];

const TAX_COMPLIANCE_KEYWORDS = [...COMPLIANCE_KEYWORDS, ...TAX_UPDATE_KEYWORDS];

const TAX_COMPLIANCE_EXCLUDE_KEYWORDS = [
  ...REGULATION_FOCUS_KEYWORDS,
  ...ALERT_KEYWORDS,
  'directive',
  'framework',
];

const NEWS_EXCLUDE_KEYWORDS = [
  ...REGULATION_FOCUS_KEYWORDS,
  ...COMPLIANCE_KEYWORDS,
  ...ALERT_KEYWORDS,
  'enforcement',
  'deadline',
  'compliance',
  'notice',
];

const withNormalizedGlyphs = <T extends { title?: string; content?: string }>(article: T): T => ({
  ...article,
  title: normalizeGlyphs(article.title) ?? article.title ?? '',
  content: normalizeGlyphs(article.content) ?? article.content ?? '',
});

export const rwandaTopicPipelines: Record<string, TopicPipelineResolver> = {
  tech: async ({ resultLimit }) => {
    const fetchLimit = Math.max(resultLimit * 2, 24);
    const [
      rraDocuments,
      minfinArticles,
      bnrDocuments,
      rdbDocuments,
      kifcDocuments,
    ] = await Promise.all([
      fetchRraPolicyDocuments(fetchLimit),
      fetchMinfinPolicyArticles(fetchLimit),
      fetchBnrRegulatoryFrameworks(fetchLimit),
      fetchRdbPolicyDocuments(fetchLimit),
      fetchKifcPolicyDocuments(fetchLimit),
    ]);

    const combined = roundRobinCombineByUrl(
      [bnrDocuments, minfinArticles, rraDocuments, rdbDocuments, kifcDocuments],
      fetchLimit,
    );

    const mapped = combined.map((doc) =>
      withNormalizedGlyphs({
        title: doc.title,
        content: doc.content,
        url: doc.url,
        thumbnail: resolveDiscoverThumbnail(doc),
        source: doc.source ?? getHost(doc.url) ?? 'Regulation Feed',
        publishedAt: doc.publishedAt ?? undefined,
      }),
    );

    const focused = filterDiscoverEntries(mapped, REGULATION_FOCUS_KEYWORDS, {
      includeBase: false,
    });
    const prioritized = focused.length > 0 ? focused : mapped;
    const cleaned = filterOutDiscoverEntries(prioritized, REGULATION_EXCLUDE_KEYWORDS);
    const candidate = cleaned.length > 0 ? cleaned : prioritized;
    const unique = dedupeByThumbnail(candidate);

    return sortByPublishedDate(unique).slice(0, resultLimit);
  },
  finance: async ({ resultLimit }) => {
    const fetchLimit = Math.max(resultLimit * 2, 24);
    const [rraNews, bnrDocuments, kifcDocuments, minfinArticles] = await Promise.all([
      fetchRraNewsArticles(fetchLimit),
      fetchBnrRegulatoryFrameworks(fetchLimit),
      fetchKifcPolicyDocuments(fetchLimit),
      fetchMinfinPolicyArticles(fetchLimit),
    ]);

    const filteredSources = [
      filterDiscoverEntries(rraNews, TAX_COMPLIANCE_KEYWORDS, { includeBase: false }),
      filterDiscoverEntries(bnrDocuments, TAX_COMPLIANCE_KEYWORDS, { includeBase: false }),
      filterDiscoverEntries(kifcDocuments, TAX_COMPLIANCE_KEYWORDS, { includeBase: false }),
      filterDiscoverEntries(minfinArticles, TAX_COMPLIANCE_KEYWORDS, { includeBase: false }),
    ];

    const combined = roundRobinCombineByUrl(filteredSources, fetchLimit);
    const fallback =
      combined.length > 0
        ? combined
        : filteredSources.flat().filter((item) => Boolean(item));

    const mapped = fallback.slice(0, fetchLimit).map((doc) =>
      withNormalizedGlyphs({
        title: doc.title,
        content: doc.content,
        url: doc.url,
        thumbnail: resolveDiscoverThumbnail(doc),
        source: doc.source ?? getHost(doc.url) ?? 'Tax Updates & Compliance Feed',
        publishedAt: doc.publishedAt ?? undefined,
      }),
    );

    const cleaned = filterOutDiscoverEntries(mapped, TAX_COMPLIANCE_EXCLUDE_KEYWORDS);
    const candidate = cleaned.length > 0 ? cleaned : mapped;
    const unique = dedupeByThumbnail(candidate);

    return sortByPublishedDate(unique).slice(0, resultLimit);
  },
  art: async ({ resultLimit }) => {
    const fetchLimit = Math.max(resultLimit * 2, 24);
    const [kifcAdvisory, rdbAdvisory] = await Promise.all([
      fetchKifcAdvisoryInsights(fetchLimit),
      fetchRdbAdvisoryInsights(fetchLimit),
    ]);

    const combined = roundRobinCombineByUrl(
      [kifcAdvisory, rdbAdvisory],
      fetchLimit,
    );

    const fallback =
      combined.length > 0 ? combined : [...kifcAdvisory, ...rdbAdvisory];

    const mapped = fallback.slice(0, fetchLimit).map((doc) =>
      withNormalizedGlyphs({
        title: doc.title,
        content: doc.content,
        url: doc.url,
        thumbnail: resolveDiscoverThumbnail(doc),
        source: doc.source,
        publishedAt: doc.publishedAt,
      }),
    );

    const unique = dedupeByThumbnail(mapped);
    return unique.slice(0, resultLimit);
  },
  sports: async ({ resultLimit }) => {
    const [rraNews, bnrDocuments, minfinArticles, rdbDocuments] =
      await Promise.all([
        fetchRraNewsArticles(resultLimit),
        fetchBnrRegulatoryFrameworks(resultLimit),
        fetchMinfinPolicyArticles(resultLimit),
        fetchRdbPolicyDocuments(resultLimit),
      ]);

    const filteredSources = [
      filterDiscoverEntries(rraNews, ALERT_KEYWORDS),
      filterDiscoverEntries(bnrDocuments, ALERT_KEYWORDS),
      filterDiscoverEntries(minfinArticles, ALERT_KEYWORDS),
      filterDiscoverEntries(rdbDocuments, ALERT_KEYWORDS),
    ];

    const socialTimelines = await Promise.all(
      RWANDA_ALERT_HANDLES.map(({ handle, label }) =>
        fetchXTimeline(handle, label, Math.min(10, resultLimit)),
      ),
    );

    const combined = roundRobinCombineByUrl(
      [...filteredSources, ...socialTimelines],
      resultLimit,
    );

    const fallback =
      combined.length > 0
        ? combined
        : filteredSources.flat().filter((item) => Boolean(item));

    const mapped = fallback.map((doc) =>
      withNormalizedGlyphs({
        title: doc.title,
        content: doc.content,
        url: doc.url,
        thumbnail: resolveDiscoverThumbnail(doc),
        source: doc.source ?? getHost(doc.url) ?? 'Alerts Feed',
        publishedAt: doc.publishedAt ?? undefined,
      }),
    );

    const unique = dedupeByThumbnail(mapped);

    return sortByPublishedDate(unique);
  },
  entertainment: async ({ resultLimit }) => {
    const fetchLimit = Math.max(resultLimit * 2, 24);
    const minfinArticles = await fetchMinfinPolicyArticles(fetchLimit);

    const filtered = filterOutDiscoverEntries(minfinArticles, NEWS_EXCLUDE_KEYWORDS);
    const candidate = filtered.length > 0 ? filtered : minfinArticles;

    const mapped = candidate.map((doc) =>
      withNormalizedGlyphs({
        title: doc.title,
        content: doc.content,
        url: doc.url,
        thumbnail: resolveDiscoverThumbnail(doc),
        source: doc.source ?? getHost(doc.url) ?? 'Minecofin News',
        publishedAt: doc.publishedAt,
      }),
    );

    const unique = dedupeByThumbnail(mapped);

    return sortByPublishedDate(unique).slice(0, resultLimit);
  },
};
