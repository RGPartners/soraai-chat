import type { CountryOverride } from './topics';
import { rwandaTopicOverrides } from './countries/rwanda/topicOverrides';

export type TopicCountryOverrides = Record<string, Record<string, CountryOverride>>;
export type CountryTopicOverrides = Record<string, CountryOverride>;

export const topicCountryOverrides: TopicCountryOverrides = {};

export const registerTopicCountryOverride = (
  topicKey: string,
  country: string,
  override: CountryOverride,
) => {
  if (!topicCountryOverrides[topicKey]) {
    topicCountryOverrides[topicKey] = {};
  }

  topicCountryOverrides[topicKey][country.toLowerCase()] = override;
};

const staticCountryOverrides: Record<string, CountryTopicOverrides> = {
  rwanda: rwandaTopicOverrides,
};

Object.entries(staticCountryOverrides).forEach(([country, overrides]) => {
  Object.entries(overrides).forEach(([topicKey, override]) => {
    registerTopicCountryOverride(topicKey, country, override);
  });
});
