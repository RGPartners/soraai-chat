export interface DiscoverArticle {
  title: string;
  content: string;
  url: string;
  thumbnail?: string;
  source?: string;
  publishedAt?: string;
}

export interface DiscoverTopicSummary {
  key: string;
  label: string;
  description: string;
}

export interface DiscoverFeedResponse {
  blogs: DiscoverArticle[];
  topic: DiscoverTopicSummary;
  lastUpdated: string;
  country?: string;
}
