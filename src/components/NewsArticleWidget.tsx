import Image from 'next/image';
import { useEffect, useState } from 'react';
import { normalizeThumbnailUrl } from '@/lib/utils/url';

interface Article {
  title: string;
  content: string;
  url: string;
  thumbnail: string;
}

const NewsArticleWidget = () => {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/discover?mode=preview&topic=sports&country=rwanda', {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        const articles = (data.blogs || []).filter((a: Article) => a.thumbnail);
        if (articles.length > 0) {
          setArticle(articles[Math.floor(Math.random() * articles.length)]);
        } else {
          setArticle(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div className="bg-light-secondary dark:bg-dark-secondary rounded-2xl border border-light-200 dark:border-dark-200 shadow-sm shadow-light-200/10 dark:shadow-black/25 flex flex-row items-stretch w-full h-24 min-h-[96px] max-h-[96px] p-0 overflow-hidden">
      {loading ? (
        <div className="animate-pulse flex flex-row items-stretch w-full h-full">
          <div className="w-24 min-w-24 max-w-24 h-full bg-light-200 dark:bg-dark-200" />
          <div className="flex flex-col justify-center flex-1 px-3 py-2 gap-2">
            <div className="h-4 w-3/4 rounded bg-light-200 dark:bg-dark-200" />
            <div className="h-3 w-1/2 rounded bg-light-200 dark:bg-dark-200" />
          </div>
        </div>
      ) : error ? (
        <div className="w-full text-xs text-red-400">Could not load news.</div>
      ) : article ? (
        <a
          href={`/?q=Summary: ${article.url}`}
          className="flex flex-row items-stretch w-full h-full relative overflow-hidden group"
        >
          <div className="relative w-24 min-w-24 max-w-24 h-full overflow-hidden">
            <Image
              fill
              unoptimized
              className="object-cover w-full h-full bg-light-200 dark:bg-dark-200 group-hover:scale-110 transition-transform duration-300"
              src={normalizeThumbnailUrl(article.thumbnail)}
              alt={article.title}
              sizes="96px"
            />
          </div>
          <div className="flex flex-col justify-center flex-1 px-3 py-2">
            <div className="font-semibold text-xs text-black dark:text-white leading-tight line-clamp-2 mb-1">
              {article.title}
            </div>
            <p className="text-black/60 dark:text-white/60 text-[10px] leading-relaxed line-clamp-2">
              {article.content}
            </p>
          </div>
        </a>
      ) : null}
    </div>
  );
};

export default NewsArticleWidget;
