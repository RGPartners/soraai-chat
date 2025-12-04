'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { toast } from 'sonner';
import { SocialProviders } from '@/components/auth/SocialProviders';
import type { SocialAuthenticationProvider } from '@/lib/auth/config';

interface SignInFormProps {
  emailAndPasswordEnabled: boolean;
  signUpEnabled: boolean;
  socialProviders: SocialAuthenticationProvider[];
  isFirstUser: boolean;
  redirectTo?: string;
}

const SignInForm = ({
  emailAndPasswordEnabled,
  signUpEnabled,
  socialProviders,
  isFirstUser,
  redirectTo,
}: SignInFormProps) => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialAuthenticationProvider | null>(null);

  const showEmailForm = emailAndPasswordEnabled && !isFirstUser;
  const redirectTarget = redirectTo?.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';

  const buildNextAwareHref = (path: string) => {
    if (redirectTarget === '/' || redirectTarget === path) {
      return path;
    }

    const search = new URLSearchParams({ next: redirectTarget }).toString();
    return `${path}?${search}`;
  };

  const handleEmailSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!showEmailForm) {
      return;
    }

    try {
      setLoading(true);
      await authClient.signIn.email({
        email,
        password,
        callbackURL: redirectTarget,
      });
      router.push(redirectTarget);
      router.refresh();
    } catch (error: any) {
      const message =
        error?.error?.message ||
        error?.message ||
        'Unable to sign in with the provided credentials.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: SocialAuthenticationProvider) => {
    try {
      setSocialLoading(provider);
      await authClient.signIn.social({ provider, callbackURL: redirectTarget });
    } catch (error: any) {
      const message = error?.error || error?.message || 'Unable to sign in.';
      toast.error(message);
      setSocialLoading(null);
    }
  };

  const renderEmailForm = () => {
    if (!showEmailForm) {
      return null;
    }

    return (
      <form className="space-y-4" onSubmit={handleEmailSignIn}>
        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-black/70 dark:text-white/70"
            htmlFor="email"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={loading}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-light-200/60 bg-light-primary px-3 py-2 text-sm text-black focus:border-[#24A0ED] focus:outline-none focus:ring-offset-0 dark:border-dark-200/60 dark:bg-dark-primary dark:text-white"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-black/70 dark:text-white/70"
            htmlFor="password"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={loading}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-light-200/60 bg-light-primary px-3 py-2 text-sm text-black focus:border-[#24A0ED] focus:outline-none focus:ring-offset-0 dark:border-dark-200/60 dark:bg-dark-primary dark:text-white"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[#1f2933] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#11161b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2933] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    );
  };

  const hasAnyProvider = showEmailForm || socialProviders.length > 0;

  return (
    <div className="space-y-6">
      {isFirstUser && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-200/20 px-3 py-3 text-sm text-amber-900 dark:border-amber-200/20 dark:bg-amber-400/10 dark:text-amber-200">
          Create the first administrator account to finish setting up Sora AI.
        </div>
      )}

      {renderEmailForm()}

      {showEmailForm && socialProviders.length > 0 && (
        <div className="flex items-center py-2">
          <span className="h-px flex-1 bg-light-200/60 dark:bg-dark-200/60" />
          <span className="px-3 text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
            Or continue with
          </span>
          <span className="h-px flex-1 bg-light-200/60 dark:bg-dark-200/60" />
        </div>
      )}

      <SocialProviders
        providers={socialProviders}
        onProviderClick={handleSocialSignIn}
        loadingProvider={socialLoading}
        className="mt-6"
      />

      {!hasAnyProvider && (
        <p className="text-sm text-black/60 dark:text-white/60">
          No authentication providers are currently enabled. Configure at least one authentication method to continue.
        </p>
      )}

      {signUpEnabled && (
        <p className="text-sm text-black/60 dark:text-white/60">
          {"Don't have an account?"}{' '}
          <Link
            href={buildNextAwareHref('/sign-up')}
            className="font-medium text-[#24A0ED] transition hover:underline"
          >
            Create one now.
          </Link>
        </p>
      )}
    </div>
  );
};

export default SignInForm;
