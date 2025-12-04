import 'server-only';

import { Buffer } from 'node:buffer';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';

import { auth } from '@/lib/auth/server';
import type { SessionUser } from '@/lib/auth/auth-instance';
import { pgDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import logger from '@/lib/logger';

const profileSyncLogger = logger.withDefaults({ tag: 'auth:profile-sync' });

type ProviderProfile = {
  name?: string | null;
  image?: string | null;
};

type AuthAccount = {
  providerId: string;
  accessToken?: string | null;
  idToken?: string | null;
};

const decodeIdTokenPayload = (token: string): Record<string, unknown> | null => {
  try {
    const segments = token.split('.');
    if (segments.length < 2) {
      return null;
    }

    const base64 = segments[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(segments[1].length / 4) * 4, '=');

    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch (error) {
    profileSyncLogger.warn('Failed to decode id token payload.', error);
    return null;
  }
};

const extractGoogleProfile = (account: AuthAccount): ProviderProfile => {
  if (!account.idToken) {
    return {};
  }

  const payload = decodeIdTokenPayload(account.idToken);
  if (!payload) {
    return {};
  }

  const image = typeof payload.picture === 'string' ? payload.picture : null;
  const name = typeof payload.name === 'string' ? payload.name : null;

  return { name, image };
};

const fetchGitHubProfile = async (account: AuthAccount): Promise<ProviderProfile> => {
  if (!account.accessToken) {
    return {};
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SoraAI',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      profileSyncLogger.warn('Failed to load GitHub profile metadata.', {
        status: response.status,
        statusText: response.statusText,
      });
      return {};
    }

    const data = (await response.json()) as Record<string, unknown>;
    const image = typeof data.avatar_url === 'string' ? data.avatar_url : null;
    const nameCandidate =
      typeof data.name === 'string'
        ? data.name
        : typeof data.login === 'string'
        ? data.login
        : null;

    return {
      name: nameCandidate,
      image,
    };
  } catch (error) {
    profileSyncLogger.error('Error while fetching GitHub profile metadata.', error);
    return {};
  }
};

const resolveProviderProfile = async (accounts: AuthAccount[]): Promise<ProviderProfile> => {
  const accumulator: ProviderProfile = {};

  for (const account of accounts) {
    const provider = account.providerId;

    if (!accumulator.image || !accumulator.name) {
      if (provider === 'google') {
        const profile = extractGoogleProfile(account);
        accumulator.name ??= profile.name ?? null;
        accumulator.image ??= profile.image ?? null;
      } else if (provider === 'github') {
        const profile = await fetchGitHubProfile(account);
        accumulator.name ??= profile.name ?? null;
        accumulator.image ??= profile.image ?? null;
      }
    }

    if (accumulator.image && accumulator.name) {
      break;
    }
  }

  return accumulator;
};

export type SyncedUserProfile = {
  name: string | null;
  email: string;
  image: string | null;
};

const isEmpty = (value: string | null | undefined) =>
  !value || value.trim().length === 0;

export const syncUserProfileFromProviders = async (
  sessionUser: SessionUser,
): Promise<SyncedUserProfile> => {
  if (sessionUser.isAnonymous) {
    return {
      name: sessionUser.name ?? 'Guest',
      email: sessionUser.email ?? `${sessionUser.id}@guest.local`,
      image: sessionUser.image ?? null,
    };
  }

  const dbUser = await pgDb.query.users.findFirst({
    where: eq(users.id, sessionUser.id),
    columns: {
      name: true,
      email: true,
      image: true,
    },
  });

  const baseEmail = dbUser?.email ?? sessionUser.email;
  let resolvedName = dbUser?.name ?? sessionUser.name ?? baseEmail;
  let resolvedImage = dbUser?.image ?? sessionUser.image ?? null;

  const shouldFetchFromProvider =
    (isEmpty(dbUser?.name) && isEmpty(sessionUser.name)) ||
    (isEmpty(dbUser?.image) && isEmpty(sessionUser.image));

  let providerProfile: ProviderProfile | null = null;

  if (shouldFetchFromProvider) {
    try {
      const accountList = (await auth.api.listUserAccounts({
        params: { userId: sessionUser.id },
        headers: await headers(),
      })) as AuthAccount[];

      providerProfile = await resolveProviderProfile(accountList);
    } catch (error) {
      profileSyncLogger.error('Failed to list user accounts for profile sync.', error);
    }
  }

  const providerName = providerProfile?.name ?? null;
  const providerImage = providerProfile?.image ?? null;

  const updates: Partial<typeof users.$inferInsert> = {};

  if (isEmpty(dbUser?.name) && !isEmpty(sessionUser.name)) {
    updates.name = sessionUser.name?.trim();
    resolvedName = sessionUser.name!.trim();
  } else if (isEmpty(dbUser?.name) && providerName) {
    updates.name = providerName.trim();
    resolvedName = providerName.trim();
  }

  if (isEmpty(dbUser?.image) && !isEmpty(sessionUser.image)) {
    updates.image = sessionUser.image?.trim() ?? null;
    resolvedImage = sessionUser.image?.trim() ?? null;
  } else if (isEmpty(dbUser?.image) && providerImage) {
    updates.image = providerImage.trim();
    resolvedImage = providerImage.trim();
  }

  if (!dbUser?.email && sessionUser.email) {
    updates.email = sessionUser.email;
  }

  if (Object.keys(updates).length > 0) {
    try {
      await pgDb
        .update(users)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(users.id, sessionUser.id));
    } catch (error) {
      profileSyncLogger.error('Failed to update user profile from provider data.', error);
    }
  }

  return {
    name: resolvedName ? resolvedName.trim() : null,
    email: baseEmail,
    image: resolvedImage ? resolvedImage.trim() : null,
  };
};
