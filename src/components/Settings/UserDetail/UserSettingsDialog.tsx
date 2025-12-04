'use client';

import { Dialog, DialogPanel, Transition } from '@headlessui/react';
import { Fragment, useActionState, useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  updateUserDetailsAction,
  updateUserImageAction,
  updateUserPasswordAction,
  type UserActionState,
  type UpdateUserPasswordActionState,
} from '@/app/api/user/actions';
import type {
  BasicUserWithLastLogin,
  UserAccountInfo,
  UserStats,
} from '@/lib/user/types';
import { UserAvatarUpload } from './UserAvatarUpload';
import { cn } from '@/lib/utils';

type SidebarUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image: string | null;
  isAnonymous?: boolean;
};

type DialogProps = {
  open: boolean;
  onClose: () => void;
  user: SidebarUser;
};

type DetailsPayload = {
  user: BasicUserWithLastLogin;
  account: UserAccountInfo;
  stats: UserStats;
};

type ProfileFormState = {
  name: string;
  email: string;
  image: string;
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const initialPasswordState: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const normaliseUser = (user: BasicUserWithLastLogin): BasicUserWithLastLogin => ({
  ...user,
  createdAt: new Date(user.createdAt),
  updatedAt: new Date(user.updatedAt),
  lastLogin: user.lastLogin ? new Date(user.lastLogin) : null,
  banExpires: user.banExpires ? new Date(user.banExpires) : null,
});

export function UserSettingsDialog({ open, onClose, user }: DialogProps) {
  const [profileState, setProfileState] = useState<ProfileFormState>({
    name: user.name ?? '',
    email: user.email,
    image: user.image ?? '',
  });
  const [passwordState, setPasswordState] = useState<PasswordFormState>(
    initialPasswordState,
  );
  const [details, setDetails] = useState<DetailsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAvatarUpdating, setIsAvatarUpdating] = useState(false);

  const [profileResult, profileAction, profilePending] = useActionState(
    updateUserDetailsAction,
    undefined as UserActionState | undefined,
  );
  const [passwordResult, passwordAction, passwordPending] = useActionState(
    updateUserPasswordAction,
    undefined as UpdateUserPasswordActionState | undefined,
  );

  useEffect(() => {
    if (!open) {
      setPasswordState(initialPasswordState);
      return;
    }

    let isActive = true;

    const loadDetails = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch('/api/user/details', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to load user details');
        }

        const data: { success: boolean } & Partial<DetailsPayload> =
          await response.json();

        if (!isActive) {
          return;
        }

        if (!data.success || !data.user || !data.account || !data.stats) {
          throw new Error('Incomplete user details response');
        }

        const normalisedUser = normaliseUser(data.user);

        setDetails({
          user: normalisedUser,
          account: data.account,
          stats: data.stats,
        });
        setProfileState({
          name: normalisedUser.name ?? '',
          email: normalisedUser.email,
          image: normalisedUser.image ?? '',
        });
      } catch (error) {
        console.error(error);
        setLoadError(
          error instanceof Error ? error.message : 'Failed to load details',
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadDetails();

    return () => {
      isActive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!profileResult) {
      return;
    }

    if (profileResult.success) {
      toast.success(profileResult.message ?? 'Profile updated');
      if (profileResult.user) {
        const updatedUser = normaliseUser(profileResult.user);
        setDetails((current) =>
          current
            ? {
                ...current,
                user: updatedUser,
              }
            : current,
        );
        setProfileState({
          name: updatedUser.name ?? '',
          email: updatedUser.email,
          image: updatedUser.image ?? '',
        });
      }
    } else if (profileResult.message) {
      toast.error(profileResult.message);
    }
  }, [profileResult]);

  useEffect(() => {
    if (!passwordResult) {
      return;
    }

    if (passwordResult.success) {
      toast.success(passwordResult.message ?? 'Password updated successfully');
      setPasswordState(initialPasswordState);
    } else if (passwordResult.message) {
      toast.error(passwordResult.message);
    }
  }, [passwordResult]);

  const accountProvidersLabel = useMemo(() => {
    if (!details) {
      return '—';
    }

    if (details.account.oauthProviders.length === 0) {
      return 'Email & password';
    }

    return details.account.oauthProviders
      .map((provider) => provider.replace(/^[a-z]/, (char) => char.toUpperCase()))
      .join(', ');
  }, [details]);

  const stats = details?.stats;
  const createdAt = details?.user.createdAt ?? null;
  const lastLogin = details?.user.lastLogin ?? null;

  const handleAvatarUpload = useCallback(
    async (imageUrl: string) => {
      setIsAvatarUpdating(true);
      try {
        const formData = new FormData();
        formData.append('image', imageUrl);
        const result = await updateUserImageAction(undefined, formData);

        if (!result?.success) {
          if (result?.message) {
            toast.error(result.message);
          } else {
            toast.error('Failed to update profile photo');
          }
          return false;
        }

        toast.success(result.message ?? 'Profile photo updated');

        if (result.user) {
          const updatedUser = normaliseUser(result.user);
          setDetails((current) =>
            current
              ? {
                  ...current,
                  user: updatedUser,
                }
              : current,
          );
          setProfileState((current) => ({
            ...current,
            image: updatedUser.image ?? '',
          }));
        }

        return true;
      } catch (error) {
        console.error('Failed to update user avatar', error);
        toast.error('Failed to update profile photo');
        return false;
      } finally {
        setIsAvatarUpdating(false);
      }
    },
    [],
  );

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="relative w-full max-w-4xl transform overflow-hidden rounded-2xl bg-light-primary p-6 shadow-xl transition-all dark:bg-dark-primary">
                <button
                  type="button"
                  className="absolute right-4 top-4 rounded-full border border-transparent p-1 text-black/60 transition hover:bg-black/5 hover:text-black/80 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white/80"
                  onClick={onClose}
                  aria-label="Close user settings"
                >
                  <X className="size-5" />
                </button>
                <Dialog.Title className="text-xl font-semibold text-black dark:text-white">
                  Account Settings
                </Dialog.Title>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                  Manage your profile details, security, and activity overview.
                </p>

                {isLoading ? (
                  <div className="mt-10 flex flex-col items-center justify-center gap-4 py-12">
                    <Loader2 className="size-6 animate-spin text-black/70 dark:text-white/70" />
                    <span className="text-sm text-black/60 dark:text-white/60">
                      Loading your account details…
                    </span>
                  </div>
                ) : loadError ? (
                  <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200">
                    {loadError}
                  </div>
                ) : (
                  <div className="mt-8 space-y-6">
                    <section className="grid gap-6 lg:grid-cols-[260px,1fr]">
                      <div className="flex flex-col items-center rounded-xl border border-light-200/70 bg-white/70 p-6 text-center shadow-sm dark:border-dark-200/70 dark:bg-black/20">
                        {details ? (
                          <UserAvatarUpload
                            name={details.user.name}
                            email={details.user.email}
                            image={details.user.image}
                            onUploadComplete={handleAvatarUpload}
                            disabled={isAvatarUpdating}
                          />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-light-200 text-lg font-semibold text-black/70 dark:bg-dark-200 dark:text-white/70">
                            {user.name?.charAt(0).toUpperCase() ?? user.email.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <h3 className="mt-4 text-base font-medium text-black dark:text-white">
                          {details?.user.name ?? details?.user.email ?? '—'}
                        </h3>
                        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                          {details?.user.email}
                        </p>
                        <div className="mt-4 w-full rounded-lg bg-light-200/60 p-3 text-left text-xs text-black/60 dark:bg-dark-200/60 dark:text-white/70">
                          <p>
                            <span className="font-semibold">Role:</span> {user.role}
                          </p>
                          <p className="mt-2">
                            <span className="font-semibold">Provider:</span> {accountProvidersLabel}
                          </p>
                          <p className="mt-2">
                            <span className="font-semibold">Member since:</span>{' '}
                            {createdAt ? format(createdAt, 'PPP') : '—'}
                          </p>
                          <p className="mt-2">
                            <span className="font-semibold">Last activity:</span>{' '}
                            {lastLogin ? format(lastLogin, 'PPP p') : '—'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <form
                          action={profileAction}
                          className="rounded-xl border border-light-200/70 bg-white p-6 shadow-sm dark:border-dark-200/70 dark:bg-black/20"
                        >
                          <h3 className="text-base font-semibold text-black dark:text-white">
                            Profile
                          </h3>
                          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                            Update your display name, email address, or avatar URL.
                          </p>

                          <div className="mt-5 grid gap-4">
                            <label className="text-sm font-medium text-black/70 dark:text-white/70">
                              Name
                              <input
                                name="name"
                                value={profileState.name}
                                onChange={(event) =>
                                  setProfileState((prev) => ({
                                    ...prev,
                                    name: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded-lg border border-light-200 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-dark-200 dark:bg-dark-secondary dark:text-white"
                                placeholder="Enter your name"
                                required
                              />
                            </label>

                            <label className="text-sm font-medium text-black/70 dark:text-white/70">
                              Email
                              <input
                                name="email"
                                value={profileState.email}
                                onChange={(event) =>
                                  setProfileState((prev) => ({
                                    ...prev,
                                    email: event.target.value,
                                  }))
                                }
                                type="email"
                                className="mt-1 w-full rounded-lg border border-light-200 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-dark-200 dark:bg-dark-secondary dark:text-white"
                                placeholder="you@example.com"
                              />
                            </label>

                            <label className="text-sm font-medium text-black/70 dark:text-white/70">
                              Avatar URL
                              <input
                                name="image"
                                value={profileState.image}
                                onChange={(event) =>
                                  setProfileState((prev) => ({
                                    ...prev,
                                    image: event.target.value,
                                  }))
                                }
                                type="url"
                                className="mt-1 w-full rounded-lg border border-light-200 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-dark-200 dark:bg-dark-secondary dark:text-white"
                                placeholder="https://example.com/avatar.png"
                              />
                            </label>
                          </div>

                          <div className="mt-6 flex justify-end">
                            <button
                              type="submit"
                              disabled={profilePending}
                              className={cn(
                                'inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition',
                                profilePending
                                  ? 'cursor-not-allowed opacity-60'
                                  : 'hover:bg-sky-700',
                              )}
                            >
                              {profilePending ? (
                                <>
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                  Saving…
                                </>
                              ) : (
                                'Save changes'
                              )}
                            </button>
                          </div>
                        </form>

                        <form
                          action={passwordAction}
                          className="rounded-xl border border-light-200/70 bg-white p-6 shadow-sm dark:border-dark-200/70 dark:bg-black/20"
                        >
                          <h3 className="text-base font-semibold text-black dark:text-white">
                            Security
                          </h3>
                          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                            Change your account password. This will sign you out on other devices.
                          </p>

                          <div className="mt-5 grid gap-4">
                            <label className="text-sm font-medium text-black/70 dark:text-white/70">
                              Current password
                              <input
                                name="currentPassword"
                                type="password"
                                value={passwordState.currentPassword}
                                onChange={(event) =>
                                  setPasswordState((prev) => ({
                                    ...prev,
                                    currentPassword: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded-lg border border-light-200 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-dark-200 dark:bg-dark-secondary dark:text-white"
                                placeholder="Current password"
                                required
                              />
                            </label>

                            <label className="text-sm font-medium text-black/70 dark:text-white/70">
                              New password
                              <input
                                name="newPassword"
                                type="password"
                                value={passwordState.newPassword}
                                onChange={(event) =>
                                  setPasswordState((prev) => ({
                                    ...prev,
                                    newPassword: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded-lg border border-light-200 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-dark-200 dark:bg-dark-secondary dark:text-white"
                                placeholder="At least 8 characters"
                                required
                              />
                            </label>

                            <label className="text-sm font-medium text-black/70 dark:text-white/70">
                              Confirm new password
                              <input
                                name="confirmPassword"
                                type="password"
                                value={passwordState.confirmPassword}
                                onChange={(event) =>
                                  setPasswordState((prev) => ({
                                    ...prev,
                                    confirmPassword: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded-lg border border-light-200 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-dark-200 dark:bg-dark-secondary dark:text-white"
                                placeholder="Repeat new password"
                                required
                              />
                            </label>
                          </div>

                          <div className="mt-6 flex justify-end">
                            <button
                              type="submit"
                              disabled={passwordPending}
                              className={cn(
                                'inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition dark:bg-white dark:text-black',
                                passwordPending
                                  ? 'cursor-not-allowed opacity-60'
                                  : 'hover:bg-black/90 dark:hover:bg-white/90',
                              )}
                            >
                              {passwordPending ? (
                                <>
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                  Updating…
                                </>
                              ) : (
                                'Update password'
                              )}
                            </button>
                          </div>
                        </form>
                      </div>
                    </section>

                    {stats && (
                      <section className="rounded-xl border border-light-200/70 bg-white p-6 shadow-sm dark:border-dark-200/70 dark:bg-black/20">
                        <h3 className="text-base font-semibold text-black dark:text-white">
                          Activity overview
                        </h3>
                        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                          Last {stats.period.toLowerCase()} of activity within Sora AI.
                        </p>

                        <div className="mt-6 grid gap-4 sm:grid-cols-3">
                          <div className="rounded-lg border border-light-200/70 bg-light-200/40 p-4 text-center shadow-sm dark:border-dark-200/70 dark:bg-dark-200/40">
                            <p className="text-xs uppercase tracking-wide text-black/60 dark:text-white/60">
                              Chats started
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-black dark:text-white">
                              {stats.chatCount}
                            </p>
                          </div>

                          <div className="rounded-lg border border-light-200/70 bg-light-200/40 p-4 text-center shadow-sm dark:border-dark-200/70 dark:bg-dark-200/40">
                            <p className="text-xs uppercase tracking-wide text-black/60 dark:text-white/60">
                              Messages sent
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-black dark:text-white">
                              {stats.messageCount}
                            </p>
                          </div>

                          <div className="rounded-lg border border-light-200/70 bg-light-200/40 p-4 text-center shadow-sm dark:border-dark-200/70 dark:bg-dark-200/40">
                            <p className="text-xs uppercase tracking-wide text-black/60 dark:text-white/60">
                              Reporting period
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-black dark:text-white">
                              {stats.period}
                            </p>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </DialogPanel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
