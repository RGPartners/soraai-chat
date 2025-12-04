import { redirect } from 'next/navigation';
import SignUpForm from '@/components/auth/SignUpForm';
import { getAuthConfig } from '@/lib/auth/config';
import { getIsFirstUser, getSession } from '@/lib/auth/server';
import type { SocialAuthenticationProvider } from '@/lib/auth/config';

type SignUpPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

const resolveRedirectTarget = (next?: string) => {
  if (!next) {
    return '/';
  }

  if (!next.startsWith('/')) {
    return '/';
  }

  if (next.startsWith('//')) {
    return '/';
  }

  return next;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const session = await getSession();

  if (session) {
    redirect('/');
  }

  const isFirstUser = await getIsFirstUser();
  const { emailAndPasswordEnabled, signUpEnabled, socialProviders } =
    getAuthConfig();

  if (!signUpEnabled && !isFirstUser) {
    redirect('/sign-in');
  }

  const enabledProviders = (Object.keys(socialProviders) as SocialAuthenticationProvider[]).filter(
    (provider) => Boolean(socialProviders[provider]),
  );

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextParam = Array.isArray(resolvedSearchParams?.next)
    ? resolvedSearchParams?.next[0]
    : resolvedSearchParams?.next;
  const redirectTarget = resolveRedirectTarget(nextParam);

  return (
    <SignUpForm
      emailAndPasswordEnabled={emailAndPasswordEnabled || isFirstUser}
      socialProviders={enabledProviders}
      isFirstUser={isFirstUser}
      redirectTo={redirectTarget}
    />
  );
}
