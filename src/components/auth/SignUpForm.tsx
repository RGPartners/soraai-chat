'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth/client';
import { signUpAction } from '@/app/api/auth/actions';
import { SocialProviders } from '@/components/auth/SocialProviders';
import type { SocialAuthenticationProvider } from '@/lib/auth/config';

interface SignUpFormProps {
  emailAndPasswordEnabled: boolean;
  socialProviders: SocialAuthenticationProvider[];
  isFirstUser: boolean;
  redirectTo?: string;
}

const SignUpForm = ({
  emailAndPasswordEnabled,
  socialProviders,
  isFirstUser,
  redirectTo,
}: SignUpFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [socialLoading, setSocialLoading] = useState<SocialAuthenticationProvider | null>(null);
  const [formValues, setFormValues] = useState({
    name: '',
    email: '',
    password: '',
  });

  const redirectTarget = redirectTo?.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';

  const buildNextAwareHref = (path: string) => {
    if (redirectTarget === '/' || redirectTarget === path) {
      return path;
    }

    const search = new URLSearchParams({ next: redirectTarget }).toString();
    return `${path}?${search}`;
  };

  const handleInputChange = (
    field: 'name' | 'email' | 'password',
    value: string,
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startTransition(async () => {
      if (!emailAndPasswordEnabled) {
        return;
      }

      const result = await signUpAction(formValues);

      if (!result.success) {
        toast.error(result.message ?? 'Unable to create account.');
        return;
      }

      toast.success(result.message ?? 'Account created successfully.');
      router.push(redirectTarget);
      router.refresh();
    });
  };

  const handleSocialSignIn = async (provider: SocialAuthenticationProvider) => {
    try {
      setSocialLoading(provider);
      await authClient.signIn.social({ provider, callbackURL: redirectTarget });
    } catch (error: any) {
      const message = error?.error || error?.message || 'Unable to continue.';
      toast.error(message);
      setSocialLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-black/80 dark:text-white/80">
          {isFirstUser ? 'Create the first administrator account' : 'Create an account'}
        </h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          Access personalized settings, saved chats, and more.
        </p>
      </div>

      {emailAndPasswordEnabled && (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-black/70 dark:text-white/70"
              htmlFor="name"
            >
              Full name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              disabled={isPending}
              value={formValues.name}
              onChange={(event) => handleInputChange('name', event.target.value)}
              className="w-full rounded-lg border border-light-200/60 bg-light-primary px-3 py-2 text-sm text-black focus:border-[#24A0ED] focus:outline-none focus:ring-offset-0 dark:border-dark-200/60 dark:bg-dark-primary dark:text-white"
              placeholder="Ada Lovelace"
            />
          </div>

          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-black/70 dark:text-white/70"
              htmlFor="signup-email"
            >
              Email address
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              disabled={isPending}
              value={formValues.email}
              onChange={(event) => handleInputChange('email', event.target.value)}
              className="w-full rounded-lg border border-light-200/60 bg-light-primary px-3 py-2 text-sm text-black focus:border-[#24A0ED] focus:outline-none focus:ring-offset-0 dark:border-dark-200/60 dark:bg-dark-primary dark:text-white"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-black/70 dark:text-white/70"
              htmlFor="signup-password"
            >
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              disabled={isPending}
              value={formValues.password}
              onChange={(event) => handleInputChange('password', event.target.value)}
              className="w-full rounded-lg border border-light-200/60 bg-light-primary px-3 py-2 text-sm text-black focus:border-[#24A0ED] focus:outline-none focus:ring-offset-0 dark:border-dark-200/60 dark:bg-dark-primary dark:text-white"
              placeholder="Minimum 8 characters"
            />
            <p className="text-xs text-black/50 dark:text-white/50">
              Use at least 8 characters, including a number for a stronger password.
            </p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-[#1f2933] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#11161b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2933] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      )}

      {emailAndPasswordEnabled && socialProviders.length > 0 && (
        <div className="flex items-center pt-2">
          <span className="h-px flex-1 bg-light-200/60 dark:bg-dark-200/60" />
          <span className="px-3 text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
            Or
          </span>
          <span className="h-px flex-1 bg-light-200/60 dark:bg-dark-200/60" />
        </div>
      )}

      <SocialProviders
        providers={socialProviders}
        onProviderClick={handleSocialSignIn}
        loadingProvider={socialLoading}
      />

      {!emailAndPasswordEnabled && socialProviders.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          No sign-up methods are enabled. Ask an administrator to configure authentication providers.
        </p>
      )}

      <p className="text-sm text-black/60 dark:text-white/60">
        Already have an account?{' '}
        <Link
          href={buildNextAwareHref('/sign-in')}
          className="font-medium text-[#24A0ED] transition hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default SignUpForm;
