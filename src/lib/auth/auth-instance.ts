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

const authConfig = getAuthConfig();

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error('BETTER_AUTH_SECRET must be set');
}

const baseURL =
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

const trustedProviders = (
  Object.keys(authConfig.socialProviders) as SocialAuthenticationProvider[]
).filter((provider) => authConfig.socialProviders[provider]);

const options: BetterAuthOptions = {
  secret,
  baseURL,
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

const authLogger = logger.withDefaults({ tag: 'auth' });
const anonymousLogger = authLogger.withDefaults({ tag: 'auth:anonymous' });

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

