'use client';

import { cn } from '@/lib/utils';
import { type UserRole } from '@/lib/auth/roles';
import { BookOpenText, Home, Search, Plus } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useSelectedLayoutSegments } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import Layout from './Layout';
import UserProfileMenu from './Settings/UserProfileMenu';
import { useTranslations } from 'next-intl';

type SidebarUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  image: string | null;
  isAnonymous: boolean;
};

type SidebarProps = {
  children: React.ReactNode;
  currentUser: SidebarUser | null;
  canManageSettings: boolean;
};

const VerticalIconContainer = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn('flex flex-col items-center w-full', className)}>
      {children}
    </div>
  );
};

const UserProfile = ({
  user,
  canManageSettings,
}: {
  user: SidebarUser | null;
  canManageSettings: boolean;
}) => {
  if (!user) return null;

  return <UserProfileMenu user={user} canManageSettings={canManageSettings} />;
};

const Sidebar = ({ children, currentUser, canManageSettings }: SidebarProps) => {
  const segments = useSelectedLayoutSegments();
  const t = useTranslations('Sidebar');

  const navLinks = [
    {
      icon: Home,
      href: '/',
      active: segments.length === 0 || segments.includes('c'),
      label: t('home'),
    },
    {
      icon: Search,
      href: '/discover',
      active: segments.includes('discover'),
      label: t('briefings'),
    },
    {
      icon: BookOpenText,
      href: '/library',
      active: segments.includes('library'),
      label: t('chatHistory'),
    },
  ];

  return (
    <div>
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-[72px] lg:flex-col border-r border-light-200 dark:border-dark-200">
        <div className="flex grow flex-col items-center justify-between gap-y-5 overflow-y-auto bg-light-secondary dark:bg-dark-secondary px-2 py-8 shadow-sm shadow-light-200/10 dark:shadow-black/25">
          <Link
            href="/"
            aria-label="Sora AI home"
            className="flex items-center justify-center"
          >
            <Image
              src="/logo/logo-light-mode.png"
              alt="Sora AI logo"
              width={36}
              height={36}
              className="dark:hidden"
              priority
            />
            <Image
              src="/logo/logo-dark-mode.png"
              alt="Sora AI logo"
              width={36}
              height={36}
              className="hidden dark:block"
              priority
            />
          </Link>
          <VerticalIconContainer className="mt-6">
            {navLinks.map((link, i) => (
              <Fragment key={link.label}>
                <Link
                  href={link.href}
                  className={cn(
                    'relative flex flex-col items-center justify-center space-y-0.5 cursor-pointer w-full py-2 rounded-lg',
                    link.active
                      ? 'text-black/70 dark:text-white/70 '
                      : 'text-black/60 dark:text-white/60',
                  )}
                >
                  <div
                    className={cn(
                      link.active && 'bg-light-200 dark:bg-dark-200',
                      'group rounded-lg hover:bg-light-200 hover:dark:bg-dark-200 transition duration-200',
                    )}
                  >
                    <link.icon
                      size={25}
                      className={cn(
                        !link.active && 'group-hover:scale-105',
                        'transition duration:200 m-1.5',
                      )}
                    />
                  </div>
                  <p
                    className={cn(
                      link.active
                        ? 'text-black/80 dark:text-white/80'
                        : 'text-black/60 dark:text-white/60',
                      'text-[10px]',
                    )}
                  >
                    {link.label}
                  </p>
                </Link>
                {i === 0 && (
                  <a
                    key="new-chat"
                    href="/"
                    className="relative mt-1 flex flex-col items-center justify-center space-y-0.5 w-full py-2 rounded-lg text-black/60 dark:text-white/60 hover:text-black/70 hover:dark:text-white/70"
                    aria-label={t('startNewChat')}
                  >
                    <div className="group rounded-lg hover:bg-light-200 hover:dark:bg-dark-200 transition duration-200">
                      <Plus
                        size={25}
                        className="transition duration-200 m-1.5 group-hover:scale-105"
                      />
                    </div>
                    <p className="text-[10px]">{t('newChat')}</p>
                  </a>
                )}
              </Fragment>
            ))}
          </VerticalIconContainer>
          <UserProfile
            user={currentUser}
            canManageSettings={canManageSettings}
          />
        </div>
      </div>

      <div className="fixed bottom-0 w-full z-50 flex flex-row items-center gap-x-6 bg-light-secondary dark:bg-dark-secondary px-4 py-4 shadow-sm lg:hidden">
        {navLinks.map((link, i) => (
          <Fragment key={link.label}>
            <Link
              href={link.href}
              className={cn(
                'relative flex flex-col items-center space-y-1 text-center w-full',
                link.active
                  ? 'text-black dark:text-white'
                  : 'text-black dark:text-white/70',
              )}
            >
              {link.active && (
                <div className="absolute top-0 -mt-4 h-1 w-full rounded-b-lg bg-black dark:bg-white" />
              )}
              <link.icon />
              <p className="text-xs">{link.label}</p>
            </Link>
            {i === 0 && (
              <a
                key="mobile-new-chat"
                href="/"
                className="relative flex flex-col items-center space-y-1 text-center w-full text-black dark:text-white/70"
                aria-label={t('startNewChat')}
              >
                <Plus size={20} />
                <p className="text-xs">{t('newChat')}</p>
              </a>
            )}
          </Fragment>
        ))}
        <div className="flex w-full items-center justify-center">
          <UserProfile
            user={currentUser}
            canManageSettings={canManageSettings}
          />
        </div>
      </div>

      <Layout>{children}</Layout>
    </div>
  );
};

export default Sidebar;
