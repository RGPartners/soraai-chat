import { redirect } from 'next/navigation';
import SignInForm from '@/components/auth/SignInForm';
import { getAuthConfig } from '@/lib/auth/config';
import { getIsFirstUser, getSession } from '@/lib/auth/server';
import type { SocialAuthenticationProvider } from '@/lib/auth/config';

type SignInPageProps = {
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

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getSession();

  const isAnonymousSession = Boolean(session?.user?.isAnonymous);

  if (session && !isAnonymousSession) {
    redirect('/');
  }

  const isFirstUser = await getIsFirstUser();
  const { emailAndPasswordEnabled, signUpEnabled, socialProviders } =
    getAuthConfig();

  const enabledProviders = (Object.keys(socialProviders) as SocialAuthenticationProvider[]).filter(
    (provider) => Boolean(socialProviders[provider]),
  );

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextParam = Array.isArray(resolvedSearchParams?.next)
    ? resolvedSearchParams?.next[0]
    : resolvedSearchParams?.next;
  const redirectTarget = resolveRedirectTarget(nextParam);

  return (
    <SignInForm
      emailAndPasswordEnabled={emailAndPasswordEnabled}
      signUpEnabled={signUpEnabled || isFirstUser}
      socialProviders={enabledProviders}
      isFirstUser={isFirstUser}
      redirectTo={redirectTarget}
    />
  );
}
