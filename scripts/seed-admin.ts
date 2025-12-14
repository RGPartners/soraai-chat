import './load-env';

import { eq } from 'drizzle-orm';

import { auth } from '../src/lib/auth/auth-instance';
import { USER_ROLES } from '../src/lib/auth/roles';
import db from '../src/lib/db';
import { users } from '../src/lib/db/schema';

const resolveBaseUrl = () => {
  const candidates = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter((value): value is string => Boolean(value && value.trim()));

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      return url;
    } catch (error) {
      console.warn(
        `[seed-admin] Ignoring invalid URL candidate ${candidate}:`,
        error,
      );
    }
  }

  return new URL('http://localhost:3000');
};

const getForwardedHeaders = (url: URL) => {
  const protocol = url.protocol.replace(':', '') || 'http';

  return new Headers({
    'content-type': 'application/json',
    host: url.host,
    origin: url.origin,
    'x-forwarded-host': url.host,
    'x-forwarded-proto': protocol,
  });
};

const ensureAdminUser = async () => {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Admin User';

  if (!email || !password) {
    console.info('[seed-admin] SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not set. Skipping admin seeding.');
    return;
  }

  console.info(`[seed-admin] Ensuring admin user for ${email}`);

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    if (existingUser.role !== USER_ROLES.ADMIN) {
      await db
        .update(users)
        .set({ role: USER_ROLES.ADMIN })
        .where(eq(users.email, email));
      console.info('[seed-admin] Existing user found. Role updated to admin.');
    } else {
      console.info('[seed-admin] Admin user already exists. No changes needed.');
    }
    return;
  }

  const baseUrl = resolveBaseUrl();
  const headers = getForwardedHeaders(baseUrl);

  console.info('[seed-admin] Creating admin user via Better Auth API.');

  const result = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
    },
    headers,
  });

  if (!result?.user) {
    throw new Error('[seed-admin] Failed to create admin user via Better Auth.');
  }

  await db
    .update(users)
    .set({ role: USER_ROLES.ADMIN })
    .where(eq(users.email, email));

  console.info('[seed-admin] Admin user created successfully.');
};

ensureAdminUser()
  .then(() => {
    console.info('[seed-admin] Completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[seed-admin] Failed to ensure admin user.', error);
    process.exit(1);
  });