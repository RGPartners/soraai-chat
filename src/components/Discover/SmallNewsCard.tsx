import { formatDistanceToNow } from 'date-fns';
import { normalizeThumbnailUrl } from '@/lib/utils/url';
import Image from 'next/image';
import Link from 'next/link';
import type { DiscoverArticle } from '@/lib/types/discover';

const getRelativePublished = (isoDate?: string) => {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true });
};

const SmallNewsCard = ({ item }: { item: DiscoverArticle }) => {
  const relativePublished = getRelativePublished(item.publishedAt);

  return (
    <Link
      href={`/?q=Summary: ${item.url}`}
      className="rounded-3xl overflow-hidden bg-light-secondary dark:bg-dark-secondary shadow-sm shadow-light-200/10 dark:shadow-black/25 group flex flex-col"
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="relative aspect-video overflow-hidden">
        <Image
          fill
          unoptimized
          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
          src={normalizeThumbnailUrl(item.thumbnail)}
          alt={item.title}
          sizes="(max-width: 1024px) 100vw, 320px"
        />
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-sm mb-2 leading-tight line-clamp-2 group-hover:text-cyan-500 dark:group-hover:text-cyan-300 transition duration-200">
          {item.title}
        </h3>
        <p className="text-black/60 dark:text-white/60 text-xs leading-relaxed line-clamp-2">
          {item.content}
        </p>
        {(item.source || relativePublished) && (
          <div className="mt-3 flex items-center justify-between text-xs text-black/45 dark:text-white/45">
            <span className="font-medium text-black/60 dark:text-white/60">
              {item.source ?? 'Source'}
            </span>
            {relativePublished && <span>{relativePublished}</span>}
          </div>
        )}
      </div>
    </Link>
  );
};

export default SmallNewsCard;
