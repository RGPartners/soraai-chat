import { topicCountryOverrides } from './topicOverrides';

export interface DiscoverTopicDefinition {
  key: string;
  label: string;
  description: string;
  domains: string[];
  queries: string[];
  keywords?: string[];
  engines?: string[];
  language?: string;
  resultLimit?: number;
  includeBaseKeywords?: boolean;
  countries?: Record<string, CountryOverride>;
}

export interface CountryOverride {
  label?: string;
  description?: string;
  domains?: string[];
  queries?: string[];
  keywords?: string[];
  engines?: string[];
  language?: string;
  resultLimit?: number;
  includeBaseKeywords?: boolean;
}

export const TAX_KEYWORDS = [
  'tax',
  'taxation',
  'irs',
  'gst',
  'vat',
  'withholding',
  'audit',
  'compliance',
  'transfer pricing',
  'excise',
  'tariff',
  'revenue authority',
  'fiscal policy',
  'tax policy',
  'tax reform',
];

const baseTopics: DiscoverTopicDefinition[] = [
  {
    key: 'tech',
    label: 'Tech & Science',
    description: 'Breakthroughs in technology, AI, and scientific research shaping the world.',
    domains: ['techcrunch.com', 'wired.com', 'theverge.com'],
    queries: ['technology news', 'latest tech', 'artificial intelligence', 'science innovation'],
    includeBaseKeywords: false,
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Markets, corporate moves, and economic developments across the globe.',
    domains: ['bloomberg.com', 'cnbc.com', 'marketwatch.com'],
    queries: ['finance news', 'economy update', 'stock market analysis', 'investment trends'],
    includeBaseKeywords: false,
  },
  {
    key: 'art',
    label: 'Art & Culture',
    description: 'Cultural stories and creative movements spanning art, media, and design.',
    domains: ['artnews.com', 'hyperallergic.com', 'theartnewspaper.com'],
    queries: ['art news', 'culture spotlight', 'creative industry', 'museum exhibition'],
    includeBaseKeywords: false,
  },
  {
    key: 'sports',
    label: 'Sports',
    description: 'Highlights and analysis from major sporting events and leagues worldwide.',
    domains: ['espn.com', 'bbc.com/sport', 'skysports.com'],
    queries: ['sports news', 'football highlights', 'basketball analysis', 'tennis results'],
    includeBaseKeywords: false,
  },
  {
    key: 'entertainment',
    label: 'Entertainment',
    description: 'Film, television, music, and celebrity stories driving the conversation.',
    domains: ['hollywoodreporter.com', 'variety.com', 'deadline.com'],
    queries: ['entertainment news', 'movie release', 'tv premiere', 'celebrity interview'],
    includeBaseKeywords: false,
  },
];

const discoverTopics: DiscoverTopicDefinition[] = baseTopics.map((topic) => {
  const overrides = topicCountryOverrides[topic.key];
  if (!overrides) {
    return topic;
  }

  return {
    ...topic,
    countries: overrides,
  };
});

const buildPublicTopic = (
  topic: DiscoverTopicDefinition,
  country?: string,
) => {
  if (!country || country === 'global') {
    return {
      key: topic.key,
      label: topic.label,
      description: topic.description,
    };
  }

  const override = topic.countries?.[country];
  if (!override) {
    return {
      key: topic.key,
      label: topic.label,
      description: topic.description,
    };
  }

  return {
    key: topic.key,
    label: override.label ?? topic.label,
    description: override.description ?? topic.description,
  };
};

export const getPublicTopics = (country?: string) =>
  discoverTopics.map((topic) => buildPublicTopic(topic, country));

export const publicDiscoverTopics = getPublicTopics();

export const defaultDiscoverTopicKey = discoverTopics[0]?.key || 'tech';

export const getDiscoverTopic = (key: string): DiscoverTopicDefinition => {
  return discoverTopics.find((topic) => topic.key === key) || discoverTopics[0];
};

const cloneTopicDefinition = (topic: DiscoverTopicDefinition) => ({
  ...topic,
  domains: [...topic.domains],
  queries: [...topic.queries],
  keywords: topic.keywords ? [...topic.keywords] : undefined,
  engines: topic.engines ? [...topic.engines] : undefined,
});

export const getCountryAwareTopic = (
  key: string,
  country?: string,
): { topic: DiscoverTopicDefinition; appliedCountry?: string } => {
  const baseTopic = cloneTopicDefinition(getDiscoverTopic(key));
  const normalizedCountry = country?.toLowerCase();
  if (!normalizedCountry || normalizedCountry === 'global') {
    return {
      topic: baseTopic,
    };
  }

  const override = baseTopic.countries?.[normalizedCountry];
  if (!override) {
    return {
      topic: baseTopic,
    };
  }

  const mergedKeywords = override.keywords?.length
    ? Array.from(new Set([...(baseTopic.keywords ?? []), ...override.keywords]))
    : baseTopic.keywords;

  return {
    topic: {
      ...baseTopic,
      label: override.label ?? baseTopic.label,
      description: override.description ?? baseTopic.description,
      domains: override.domains?.length ? [...override.domains] : baseTopic.domains,
      queries: override.queries?.length ? [...override.queries] : baseTopic.queries,
      keywords: mergedKeywords,
      engines: override.engines?.length ? [...override.engines] : baseTopic.engines,
      language: override.language ?? baseTopic.language,
      resultLimit: override.resultLimit ?? baseTopic.resultLimit,
      includeBaseKeywords:
        override.includeBaseKeywords ?? baseTopic.includeBaseKeywords,
    },
    appliedCountry: normalizedCountry,
  };
};

export const getAllDiscoverTopics = (): DiscoverTopicDefinition[] => {
  return discoverTopics;
};
