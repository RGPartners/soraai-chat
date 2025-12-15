import type { AuthSession } from '@/lib/auth/server';

export type EntitlementTier = 'guest' | 'regular' | 'paid';

type Entitlement = {
  /**
   * Maximum number of user messages allowed in a rolling 24 hour window.
   * Use `null` to indicate no enforced limit for the tier.
   */
  maxMessagesPerDay: number | null;
};

export const entitlementsByTier: Record<EntitlementTier, Entitlement> = {
  /*
   * For users without an account
   */
  guest: {
    maxMessagesPerDay: 2,
  },

  /*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay: null,
  },

  /*
   * TODO: For users with an account and a paid membership
   */
  paid: {
    maxMessagesPerDay: null,
  },
};

export const resolveEntitlementTier = (session: AuthSession): EntitlementTier => {
  if (!session?.user) {
    return 'guest';
  }

  if (session.user.isAnonymous) {
    return 'guest';
  }

  // Placeholder for future paid tier detection logic.
  return 'regular';
};

export const getEntitlementForSession = (session: AuthSession) => {
  const tier = resolveEntitlementTier(session);
  return { tier, entitlement: entitlementsByTier[tier] };
};
