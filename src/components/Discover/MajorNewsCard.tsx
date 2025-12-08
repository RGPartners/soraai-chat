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

const MajorNewsCard = ({
  item,
  isLeft = true,
}: {
  item: DiscoverArticle;
  isLeft?: boolean;
}) => {
  const relativePublished = getRelativePublished(item.publishedAt);

  const Meta = () => (
    <div className="mt-4 flex items-center gap-3 text-sm text-black/45 dark:text-white/45">
      <span className="font-medium text-black/60 dark:text-white/60">
        {item.source ?? 'Source'}
      </span>
      {relativePublished && <span>{relativePublished}</span>}
    </div>
  );

  return (
    <Link
      href={`/?q=Summary: ${item.url}`}
      className="w-full group flex flex-row items-stretch gap-6 h-60 py-3"
      target="_blank"
      rel="noopener noreferrer"
    >
      {isLeft ? (
        <>
          <div className="relative w-80 h-full overflow-hidden rounded-2xl flex-shrink-0">
            <Image
              fill
              unoptimized
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
              src={normalizeThumbnailUrl(item.thumbnail)}
              alt={item.title}
              sizes="320px"
            />
          </div>
          <div className="flex flex-col justify-center flex-1 py-4">
            <h2
              className="text-3xl font-light mb-3 leading-tight line-clamp-3 group-hover:text-cyan-500 dark:group-hover:text-cyan-300 transition duration-200"
              style={{ fontFamily: 'PP Editorial, serif' }}
            >
              {item.title}
            </h2>
            <p className="text-black/60 dark:text-white/60 text-base leading-relaxed line-clamp-4">
              {item.content}
            </p>
            {(item.source || relativePublished) && <Meta />}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col justify-center flex-1 py-4">
            <h2
              className="text-3xl font-light mb-3 leading-tight line-clamp-3 group-hover:text-cyan-500 dark:group-hover:text-cyan-300 transition duration-200"
              style={{ fontFamily: 'PP Editorial, serif' }}
            >
              {item.title}
            </h2>
            <p className="text-black/60 dark:text-white/60 text-base leading-relaxed line-clamp-4">
              {item.content}
            </p>
            {(item.source || relativePublished) && <Meta />}
          </div>
          <div className="relative w-80 h-full overflow-hidden rounded-2xl flex-shrink-0">
            <Image
              fill
              unoptimized
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
              src={normalizeThumbnailUrl(item.thumbnail)}
              alt={item.title}
              sizes="320px"
            />
          </div>
        </>
      )}
    </Link>
  );
};

export default MajorNewsCard;
