export const roundRobinCombineByUrl = <T extends { url: string }>(
  sources: T[][],
  limit: number,
) => {
  const queues = sources.map((items) => [...items]);
  const merged: T[] = [];
  const seen = new Set<string>();

  const pushIfNew = (item: T) => {
    const key = item.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    merged.push(item);
    return true;
  };

  let progress = true;
  while (merged.length < limit && progress) {
    progress = false;
    for (const queue of queues) {
      while (queue.length) {
        const candidate = queue.shift()!;
        if (pushIfNew(candidate)) {
          progress = true;
          break;
        }
      }
      if (merged.length >= limit) break;
    }
  }

  if (merged.length < limit) {
    for (const queue of queues) {
      while (queue.length && merged.length < limit) {
        const candidate = queue.shift()!;
        pushIfNew(candidate);
      }
      if (merged.length >= limit) break;
    }
  }

  return merged;
};
