'use client';

import { NotebookPen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import SmallNewsCard from '@/components/Discover/SmallNewsCard';
import MajorNewsCard from '@/components/Discover/MajorNewsCard';
import CountrySelect from '@/components/Discover/CountrySelect';
import {
  defaultDiscoverTopicKey,
  getPublicTopics,
} from '@/lib/discover/topics';
import {
  DEFAULT_DISCOVER_COUNTRY,
  getCountryLabel,
} from '@/lib/discover/countries';

const INITIAL_DISCOVER_COUNTRY = DEFAULT_DISCOVER_COUNTRY;
import type {
  DiscoverArticle,
  DiscoverFeedResponse,
  DiscoverTopicSummary,
} from '@/lib/types/discover';

const Page = () => {
  const [articles, setArticles] = useState<DiscoverArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<string>(defaultDiscoverTopicKey);
  const [selectedCountry, setSelectedCountry] = useState<string>(INITIAL_DISCOVER_COUNTRY);
  const [availableTopics, setAvailableTopics] = useState(() => getPublicTopics(INITIAL_DISCOVER_COUNTRY));
  const [topicMeta, setTopicMeta] = useState<DiscoverTopicSummary | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [resolvedCountry, setResolvedCountry] = useState<string>(INITIAL_DISCOVER_COUNTRY);

  useEffect(() => {
    const nextTopics = getPublicTopics(selectedCountry);
    setAvailableTopics(nextTopics);
    if (!nextTopics.some((topic) => topic.key === selectedTopic)) {
      const fallback = nextTopics[0]?.key ?? defaultDiscoverTopicKey;
      setSelectedTopic(fallback);
    }
  }, [selectedCountry, selectedTopic]);

  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();

    const fetchArticles = async () => {
      setLoading(true);

      try {
        const params = new URLSearchParams({ topic: selectedTopic });
        if (selectedCountry && selectedCountry !== 'global') {
          params.set('country', selectedCountry);
        }

        const res = await fetch(`/api/discover?${params.toString()}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        const data: DiscoverFeedResponse = await res.json();

        if (!res.ok) {
          const message = (data as any)?.message ?? 'Unable to load briefing feed';
          throw new Error(message);
        }

        if (isCancelled) return;

        setArticles(Array.isArray(data.blogs) ? data.blogs : []);
        setTopicMeta(data.topic ?? null);
        setLastUpdated(data.lastUpdated ?? null);
        setResolvedCountry(data.country ?? selectedCountry ?? INITIAL_DISCOVER_COUNTRY);
      } catch (error) {
        if (controller.signal.aborted || isCancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching briefing feed:', message, error);
        toast.error('Error fetching briefing feed');
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchArticles();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [selectedTopic, selectedCountry]);

  const updatedAgo = useMemo(() => {
    if (!lastUpdated) return null;
    const date = new Date(lastUpdated);
    if (Number.isNaN(date.getTime())) return null;
    return formatDistanceToNow(date, { addSuffix: true });
  }, [lastUpdated]);

  const resolvedCountryLabel = useMemo(
    () => getCountryLabel(resolvedCountry),
    [resolvedCountry],
  );
  const isTaxAlertsTopic = topicMeta?.label === 'Tax Alerts & Deadlines';

  return (
    <>
      <div>
        <div className="flex flex-col pt-10 border-b border-light-200/20 dark:border-dark-200/20 pb-6 px-2">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex items-center">
                <NotebookPen size={45} className="mb-2.5" />
                <h1
                  className="text-5xl font-normal p-2"
                  style={{ fontFamily: 'PP Editorial, serif' }}
                >
                  Tax Updates and Briefings
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-black/60 dark:text-white/60">
                {topicMeta ? (
                  <span className="rounded-full border border-black/15 px-3 py-1 text-xs uppercase tracking-[0.18rem] text-black/70 dark:border-white/15 dark:text-white/70">
                    {topicMeta.label}
                  </span>
                ) : null}
                <span className="text-xs text-black/50 dark:text-white/50">
                  Region: {resolvedCountryLabel}
                </span>
                {updatedAgo && (
                  <span className="text-xs text-black/50 dark:text-white/50">
                    Updated {updatedAgo}
                  </span>
                )}
              </div>
              <p className="max-w-2xl text-sm text-black/60 dark:text-white/60">
                {topicMeta?.description ??
                  'Select a topic to explore curated policy, compliance, and market coverage.'}
              </p>
            </div>
            <CountrySelect
              value={selectedCountry}
              onChange={setSelectedCountry}
              className="self-start lg:mt-2"
            />
          </div>
          <div className="mt-6 flex flex-row items-center gap-2 overflow-x-auto">
            {availableTopics.map((topic) => (
              <button
                key={topic.key}
                type="button"
                className={cn(
                  'border-[0.1px] rounded-full text-sm px-3 py-1 text-nowrap transition duration-200',
                  selectedTopic === topic.key
                    ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-300/20 border-cyan-700/60 dark:bg-cyan-300/30 dark:border-cyan-300/40'
                    : 'border-black/30 dark:border-white/30 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white hover:border-black/40 dark:hover:border-white/40 hover:bg-black/5 dark:hover:bg-white/5',
                )}
                onClick={() => setSelectedTopic(topic.key)}
              >
                <span>{topic.label}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-row items-center justify-center min-h-screen">
            <svg
              aria-hidden="true"
              className="w-8 h-8 text-light-200 fill-light-secondary dark:text-[#202020] animate-spin dark:fill-[#ffffff3b]"
              viewBox="0 0 100 101"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M100 50.5908C100.003 78.2051 78.1951 100.003 50.5908 100C22.9765 99.9972 0.997224 78.018 1 50.4037C1.00281 22.7993 22.8108 0.997224 50.4251 1C78.0395 1.00281 100.018 22.8108 100 50.4251ZM9.08164 50.594C9.06312 73.3997 27.7909 92.1272 50.5966 92.1457C73.4023 92.1642 92.1298 73.4365 92.1483 50.6308C92.1669 27.8251 73.4392 9.0973 50.6335 9.07878C27.8278 9.06026 9.10003 27.787 9.08164 50.594Z"
                fill="currentColor"
              />
              <path
                d="M93.9676 39.0409C96.393 38.4037 97.8624 35.9116 96.9801 33.5533C95.1945 28.8227 92.871 24.3692 90.0681 20.348C85.6237 14.1775 79.4473 9.36872 72.0454 6.45794C64.6435 3.54717 56.3134 2.65431 48.3133 3.89319C45.869 4.27179 44.3768 6.77534 45.014 9.20079C45.6512 11.6262 48.1343 13.0956 50.5786 12.717C56.5073 11.8281 62.5542 12.5399 68.0406 14.7911C73.527 17.0422 78.2187 20.7487 81.5841 25.4923C83.7976 28.5886 85.4467 32.059 86.4416 35.7474C87.1273 38.1189 89.5423 39.6781 91.9676 39.0409Z"
                fill="currentFill"
              />
            </svg>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-sm text-black/60 dark:text-white/60">
            <span>No updates available right now.</span>
            <span>Try another topic or region, then refresh.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-28 pt-5 lg:pb-8 w-full">
            <div className="block lg:hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {articles.map((item, i) => (
                  <SmallNewsCard key={`mobile-${i}`} item={item} />
                ))}
              </div>
            </div>

            <div className="hidden lg:block">
              {articles &&
                articles.length > 0 &&
                (() => {
                  const sections = [];
                  let index = 0;

                  while (index < articles.length) {
                    if (sections.length > 0) {
                      sections.push(
                        <hr
                          key={`sep-${index}`}
                          className="border-t border-light-200/20 dark:border-dark-200/20 my-3 w-full"
                        />,
                      );
                    }

                    if (index < articles.length) {
                      sections.push(
                        <MajorNewsCard
                          key={`major-${index}`}
                          item={articles[index]}
                          isLeft={false}
                          isCompact={isTaxAlertsTopic}
                        />,
                      );
                      index++;
                    }

                    if (index < articles.length) {
                      sections.push(
                        <hr
                          key={`sep-${index}-after`}
                          className="border-t border-light-200/20 dark:border-dark-200/20 my-3 w-full"
                        />,
                      );
                    }

                    if (index < articles.length) {
                      const smallCards = articles.slice(index, index + 3);
                      sections.push(
                        <div
                          key={`small-group-${index}`}
                          className="grid lg:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-4"
                        >
                          {smallCards.map((item, i) => (
                            <SmallNewsCard
                              key={`small-${index + i}`}
                              item={item}
                            />
                          ))}
                        </div>,
                      );
                      index += 3;
                    }

                    if (index < articles.length) {
                      sections.push(
                        <hr
                          key={`sep-${index}-after-small`}
                          className="border-t border-light-200/20 dark:border-dark-200/20 my-3 w-full"
                        />,
                      );
                    }

                    if (index < articles.length - 1) {
                      const twoMajorCards = articles.slice(index, index + 2);
                      twoMajorCards.forEach((item, i) => {
                        sections.push(
                          <MajorNewsCard
                            key={`double-${index + i}`}
                            item={item}
                            isLeft={i === 0}
                            isCompact={isTaxAlertsTopic}
                          />,
                        );
                        if (i === 0) {
                          sections.push(
                            <hr
                              key={`sep-double-${index + i}`}
                              className="border-t border-light-200/20 dark:border-dark-200/20 my-3 w-full"
                            />,
                          );
                        }
                      });
                      index += 2;
                    } else if (index < articles.length) {
                      sections.push(
                        <MajorNewsCard
                          key={`final-major-${index}`}
                          item={articles[index]}
                          isLeft={true}
                          isCompact={isTaxAlertsTopic}
                        />,
                      );
                      index++;
                    }

                    if (index < articles.length) {
                      sections.push(
                        <hr
                          key={`sep-${index}-after-major`}
                          className="border-t border-light-200/20 dark:border-dark-200/20 my-3 w-full"
                        />,
                      );
                    }

                    if (index < articles.length) {
                      const smallCards = articles.slice(index, index + 3);
                      sections.push(
                        <div
                          key={`small-group-2-${index}`}
                          className="grid lg:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-4"
                        >
                          {smallCards.map((item, i) => (
                            <SmallNewsCard
                              key={`small-2-${index + i}`}
                              item={item}
                            />
                          ))}
                        </div>,
                      );
                      index += 3;
                    }
                  }

                  return sections;
                })()}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Page;
