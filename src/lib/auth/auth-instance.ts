import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { admin as adminPlugin } from 'better-auth/plugins';
import { anonymous as anonymousPlugin } from 'better-auth/plugins/anonymous';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';
import { eq, sql } from 'drizzle-orm';

import { pgDb } from '@/lib/db';
import {
  accounts,
  chats,
  mcpServerCustomInstructions,
  mcpServers,
  mcpToolCustomInstructions,
  sessions,
  users,
  verifications,
} from '@/lib/db/schema';
import {
  getAuthConfig,
  type SocialAuthenticationProvider,
} from './config';
import logger from '@/lib/logger';
import {
  DEFAULT_USER_ROLE,
  USER_ROLES,
  ac,
  adminRoleDefinition,
  editorRoleDefinition,
  userRoleDefinition,
} from './roles';

const authLogger = logger.withDefaults({ tag: 'auth' });
const anonymousLogger = authLogger.withDefaults({ tag: 'auth:anonymous' });

const authConfig = getAuthConfig();

type BaseURLSource = 'BETTER_AUTH_URL' | 'NEXT_PUBLIC_APP_URL' | 'VERCEL_URL';

type BaseURLCandidate = {
  value: string;
  source: BaseURLSource;
};

type InvalidBaseURLCandidate = BaseURLCandidate & {
  error: unknown;
};

type BaseURLResolution = {
  baseURL: string | undefined;
  source: BaseURLSource | null;
  skippedDev: BaseURLCandidate[];
  invalid: InvalidBaseURLCandidate[];
  reason: 'resolved' | 'invalid' | 'skipped-dev-host' | 'missing';
};

const LOCAL_DEV_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '[::ffff:127.0.0.1]',
]);

const normalizeHostname = (hostname: string): string => hostname.trim().toLowerCase();

const isLocalDevHostname = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);
  return LOCAL_DEV_HOSTNAMES.has(normalized) || normalized.startsWith('127.');
};

const resolveAuthBaseURL = (): BaseURLResolution => {
  const candidates = [
    process.env.BETTER_AUTH_URL
      ? { value: process.env.BETTER_AUTH_URL, source: 'BETTER_AUTH_URL' as const }
      : null,
    process.env.NEXT_PUBLIC_APP_URL
      ? { value: process.env.NEXT_PUBLIC_APP_URL, source: 'NEXT_PUBLIC_APP_URL' as const }
      : null,
    process.env.VERCEL_URL
      ? { value: `https://${process.env.VERCEL_URL}`, source: 'VERCEL_URL' as const }
      : null,
  ].filter((candidate): candidate is BaseURLCandidate => candidate !== null);

  const skippedDev: BaseURLCandidate[] = [];
  const invalid: InvalidBaseURLCandidate[] = [];

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate.value);

      const hostname = parsed.hostname;
      const isDevHostname =
        process.env.NODE_ENV !== 'production' && isLocalDevHostname(hostname);

      if (isDevHostname) {
        skippedDev.push(candidate);
        continue;
      }

      return {
        baseURL: parsed.origin,
        source: candidate.source,
        skippedDev,
        invalid,
        reason: 'resolved',
      };
    } catch (error) {
      invalid.push({ ...candidate, error });
    }
  }

  if (invalid.length > 0) {
    return {
      baseURL: undefined,
      source: null,
      skippedDev,
      invalid,
      reason: 'invalid',
    };
  }

  if (skippedDev.length > 0) {
    return {
      baseURL: undefined,
      source: null,
      skippedDev,
      invalid,
      reason: 'skipped-dev-host',
    };
  }

  return {
    baseURL: undefined,
    source: null,
    skippedDev,
    invalid,
    reason: 'missing',
  };
};

const createLocalTrustedOriginsResolver = (
  skippedDevCandidates: BaseURLCandidate[],
): BetterAuthOptions['trustedOrigins'] | undefined => {
  if (process.env.NODE_ENV === 'production') {
    return undefined;
  }

  const allowedHostnames = new Set<string>();

  for (const candidate of skippedDevCandidates) {
    try {
      allowedHostnames.add(normalizeHostname(new URL(candidate.value).hostname));
    } catch {
      // ignore malformed entries
    }
  }

  for (const host of LOCAL_DEV_HOSTNAMES) {
    allowedHostnames.add(host);
  }

  if (allowedHostnames.size === 0) {
    return undefined;
  }

  let hasLogged = false;

  return async (request) => {
    const originHeader =
      request.headers.get('origin') ??
      request.headers.get('referer') ??
      request.headers.get('x-forwarded-origin');

    if (!originHeader) {
      return [];
    }

    try {
      const originURL = new URL(originHeader);
      const hostname = normalizeHostname(originURL.hostname);

      if (!allowedHostnames.has(hostname) && !hostname.startsWith('127.')) {
        return [];
      }

      if (!hasLogged) {
        authLogger.debug('Allowing Better Auth request origin for local development.', {
          origin: originURL.origin,
        });
        hasLogged = true;
      }

      return [originURL.origin];
    } catch {
      return [];
    }
  };
};

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error('BETTER_AUTH_SECRET must be set');
}

const baseURLResolution = resolveAuthBaseURL();
const baseURL = baseURLResolution.baseURL;

if (baseURLResolution.invalid.length > 0) {
  for (const candidate of baseURLResolution.invalid) {
    authLogger.warn('Ignoring invalid Better Auth base URL value.', {
      source: candidate.source,
      value: candidate.value,
      error:
        candidate.error instanceof Error
          ? candidate.error.message
          : String(candidate.error),
    });
  }
}

if (
  baseURLResolution.reason === 'skipped-dev-host' ||
  (baseURLResolution.reason === 'resolved' && baseURLResolution.skippedDev.length > 0)
) {
  const skipped = baseURLResolution.skippedDev.at(-1);
  if (skipped) {
    authLogger.debug('Skipping Better Auth base URL for local-only hostname.', {
      source: skipped.source,
      value: skipped.value,
    });
  }
}

const dynamicTrustedOrigins =
  baseURLResolution.reason === 'skipped-dev-host'
    ? createLocalTrustedOriginsResolver(baseURLResolution.skippedDev)
    : undefined;

if (dynamicTrustedOrigins) {
  authLogger.debug('Enabling Better Auth dynamic trusted origins resolver for development.');
}

const trustedProviders = (
  Object.keys(authConfig.socialProviders) as SocialAuthenticationProvider[]
).filter((provider) => authConfig.socialProviders[provider]);

const options: BetterAuthOptions = {
  secret,
  baseURL,
  trustedOrigins: dynamicTrustedOrigins,
  user: {
    changeEmail: { enabled: true },
    deleteUser: { enabled: true },
  },
  database: drizzleAdapter(pgDb, {
    provider: 'pg',
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const isFirstUser = await getIsFirstUser();
          const role = isFirstUser ? USER_ROLES.ADMIN : DEFAULT_USER_ROLE;

          return {
            data: {
              ...user,
              role,
            },
          };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: authConfig.emailAndPasswordEnabled,
    disableSignUp: !authConfig.signUpEnabled,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60,
    },
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies:
      process.env.NO_HTTPS === '1'
        ? false
        : process.env.NODE_ENV === 'production',
    database: {
      generateId: false,
    },
  },
  account: {
    accountLinking: {
      trustedProviders,
    },
  },
  socialProviders: authConfig.socialProviders,
};

export const auth = betterAuth({
  ...options,
  plugins: [
    anonymousPlugin({
      emailDomainName: process.env.BETTER_AUTH_ANONYMOUS_EMAIL_DOMAIN,
      generateName: async () => 'Guest',
      async onLinkAccount({ anonymousUser, newUser }) {
        const previousUserId = anonymousUser.user.id;
        const nextUserId = newUser.user.id;

        try {
          await pgDb.transaction(async (tx) => {
            await tx
              .update(chats)
              .set({ userId: nextUserId })
              .where(eq(chats.userId, previousUserId));

            await tx
              .update(mcpServers)
              .set({ userId: nextUserId })
              .where(eq(mcpServers.userId, previousUserId));

            await tx
              .update(mcpServerCustomInstructions)
              .set({ userId: nextUserId })
              .where(eq(mcpServerCustomInstructions.userId, previousUserId));

            await tx
              .update(mcpToolCustomInstructions)
              .set({ userId: nextUserId })
              .where(eq(mcpToolCustomInstructions.userId, previousUserId));
          });
        } catch (error) {
          anonymousLogger.error('Failed to migrate anonymous user data.', {
            fromUserId: previousUserId,
            toUserId: nextUserId,
            error,
          });

          throw error;
        }
      },
    }),
    adminPlugin({
      defaultRole: DEFAULT_USER_ROLE,
      adminRoles: [USER_ROLES.ADMIN],
      ac,
      roles: {
        admin: adminRoleDefinition,
        editor: editorRoleDefinition,
        user: userRoleDefinition,
      },
    }),
    nextCookies(),
  ],
});

type AuthSessionBase = Awaited<ReturnType<typeof auth.api.getSession>>;
type NonNullAuthSession = Extract<AuthSessionBase, { user: unknown }>;
type SessionUserBase = NonNullAuthSession['user'];

export type SessionUser = SessionUserBase & {
  role?: string | null;
  isAnonymous?: boolean;
};

export type AuthSession =
  | (Omit<NonNullAuthSession, 'user'> & {
      user: SessionUser;
    })
  | null;

export const getSession = async (): Promise<AuthSession> => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return null;
    }

    return session as AuthSession;
  } catch (error) {
    authLogger.error('Failed to resolve current session.', error);
    return null;
  }
};

let isFirstUserCache: boolean | null = null;

export const getIsFirstUser = async () => {
  if (isFirstUserCache === false) {
    return false;
  }

  try {
    const result = await pgDb
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(users)
      .limit(1);

    const count = result[0]?.count ?? 0;
    const isFirst = count === 0;

    if (!isFirst) {
      isFirstUserCache = false;
    }

    return isFirst;
  } catch (error) {
    authLogger.error('Failed to determine first-user state.', error);
    isFirstUserCache = false;
    return false;
  }
};

