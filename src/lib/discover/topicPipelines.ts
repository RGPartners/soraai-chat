import { rwandaTopicPipelines } from '@/lib/discover/countries/rwanda/topicPipelines';
import type { DiscoverArticle } from '@/lib/types/discover';

export interface TopicPipelineContext {
  resultLimit: number;
}

export type TopicPipelineResolver = (
  context: TopicPipelineContext,
) => Promise<DiscoverArticle[]>;

type PipelineRegistry = Record<string, Record<string, TopicPipelineResolver>>;

const registry: PipelineRegistry = {};

export const registerCountryTopicPipeline = (
  country: string,
  topicKey: string,
  resolver: TopicPipelineResolver,
) => {
  const normalizedCountry = country.toLowerCase();
  if (!registry[normalizedCountry]) {
    registry[normalizedCountry] = {};
  }

  registry[normalizedCountry][topicKey] = resolver;
};

export const getCountryTopicPipeline = (
  country?: string,
  topicKey?: string,
): TopicPipelineResolver | undefined => {
  if (!country || !topicKey) return undefined;
  return registry[country]?.[topicKey];
};

const staticCountryPipelines: Record<string, Record<string, TopicPipelineResolver>> = {
  rwanda: rwandaTopicPipelines,
};

Object.entries(staticCountryPipelines).forEach(([country, pipelines]) => {
  Object.entries(pipelines).forEach(([topicKey, resolver]) => {
    registerCountryTopicPipeline(country, topicKey, resolver);
  });
});
