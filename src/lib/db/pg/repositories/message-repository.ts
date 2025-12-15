import { and, count, eq, gte } from 'drizzle-orm';

import { pgDb } from '@/lib/db';
import { chats, messages } from '@/lib/db/schema';

type CountUserMessagesParams = {
  userId: string;
  since: Date;
};

export const messageRepository = {
  async countUserMessagesSince({ userId, since }: CountUserMessagesParams) {
    const [result] = await pgDb
      .select({ value: count(messages.id) })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(
        and(
          eq(chats.userId, userId),
          eq(messages.role, 'user'),
          gte(messages.createdAt, since),
        ),
      );

    return Number(result?.value ?? 0);
  },
};

export default messageRepository;
