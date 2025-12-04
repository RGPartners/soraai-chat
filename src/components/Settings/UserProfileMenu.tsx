'use client';

import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, type Transition } from 'framer-motion';
import {
  Bug,
  Command,
  Languages,
  LogOut,
  LogIn,
  Moon,
  Bell,
  Palette,
  Settings,
  Settings2,
  Sparkles,
  Sun,
  Shield,
  Check,
  CircleHelp,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import SettingsDialogue, {
  type SettingsSectionKey,
} from './SettingsDialogue';
import { authClient } from '@/lib/auth/client';
import { useRouter } from 'next/navigation';
import { USER_ROLES, type UserRole } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/UserAvatar';
import { UserSettingsDialog } from './UserDetail/UserSettingsDialog';
import {
  LOCALE_COOKIE_KEY,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  SUPPORTED_LOCALES,
  type SupportedLocaleCode,
} from '@/lib/constants/locales';

type SidebarUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  image: string | null;
  isAnonymous: boolean;
};

type TriggerRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type UserProfileMenuProps = {
  user: SidebarUser;
  canManageSettings: boolean;
};

type MenuButtonProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  trailing?: ReactNode;
  disabled?: boolean;
};

type ThemeChoice = {
  value: 'light' | 'dark';
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const MENU_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 20,
};

const MENU_HEIGHT_ESTIMATE = 360;

const UserProfileMenu = ({ user, canManageSettings }: UserProfileMenuProps) => {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSectionKey | undefined>(undefined);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [triggerRect, setTriggerRect] = useState<TriggerRect | null>(null);
  const [panelPlacement, setPanelPlacement] = useState<'top' | 'bottom'>('bottom');
  const [panelHeight, setPanelHeight] = useState<number>(MENU_HEIGHT_ESTIMATE);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { theme, setTheme } = useTheme();
  const locale = useLocale() as SupportedLocaleCode;
  const [currentLocale, setCurrentLocale] = useState<SupportedLocaleCode>(locale);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const tMenu = useTranslations('SettingsMenu');
  const tAuth = useTranslations('Auth');
  const tToasts = useTranslations('Toasts');
  const tRoles = useTranslations('Roles');
  const isAnonymousUser = user.isAnonymous;

  const formatRole = useCallback(
    (role: UserRole) => {
      if (role === USER_ROLES.ADMIN) return tRoles('admin');
      if (role === USER_ROLES.EDITOR) return tRoles('editor');
      return tRoles('user');
    },
    [tRoles],
  );

  const displayName = user.name ?? (isAnonymousUser ? 'Guest' : user.email);
  const roleLabel = isAnonymousUser ? 'Guest' : formatRole(user.role);

  const updateTriggerRect = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!triggerRef.current) {
      setTriggerRect(null);
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();

    setTriggerRect({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      right: rect.right + window.scrollX,
      bottom: rect.bottom + window.scrollY,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !triggerRect) {
      return;
    }

    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - triggerRect.bottom - 12;
    const spaceAbove = triggerRect.top - 12;

    if (panelHeight > spaceBelow && spaceAbove >= panelHeight) {
      setPanelPlacement('top');
    } else {
      setPanelPlacement('bottom');
    }
  }, [triggerRect, panelHeight]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const measure = () => {
      if (!panelRef.current) {
        return;
      }

      const rect = panelRef.current.getBoundingClientRect();
      setPanelHeight(rect.height);
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      const node = panelRef.current;
      if (node) {
        observer.observe(node);
      }
      return () => {
        if (node) {
          observer.unobserve(node);
        }
        observer.disconnect();
      };
    }

    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsLanguageMenuOpen(false);
      return;
    }

    updateTriggerRect();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleWindowChange = () => {
      updateTriggerRect();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isOpen, updateTriggerRect]);

  useEffect(() => {
    if (!isSettingsOpen) {
      setSettingsInitialSection(undefined);
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    setCurrentLocale(locale);
  }, [locale]);

  const openMenu = () => {
    setIsOpen(true);
    setTimeout(updateTriggerRect, 0);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const openSettingsSection = (section: SettingsSectionKey) => {
    setSettingsInitialSection(section);
    closeMenu();
    window.setTimeout(() => {
      setIsSettingsOpen(true);
    }, 160);
  };

  const openAccountSettings = () => {
    closeMenu();
    window.setTimeout(() => {
      setIsAccountDialogOpen(true);
    }, 160);
  };

  const handleKeyboardShortcuts = () => {
    toast.info(tToasts('keyboardShortcutsComingSoon'));
  };

  const handleNotifications = () => {
    toast.info(tToasts('notificationsComingSoon'));
  };

  const handleHelp = () => {
    toast.info(tToasts('helpComingSoon'));
  };

  const handleUpgradePlan = () => {
    toast.info(tToasts('upgradePlanComingSoon'));
  };

  const persistLocalePreference = (nextLocale: SupportedLocaleCode) => {
    if (typeof document === 'undefined') {
      return;
    }

    document.cookie = `${LOCALE_COOKIE_KEY}=${nextLocale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  };

  const handleLocaleSelection = (nextLocale: SupportedLocaleCode) => {
    if (nextLocale === currentLocale) {
      setIsLanguageMenuOpen(false);
      return;
    }

    setCurrentLocale(nextLocale);
    persistLocalePreference(nextLocale);
    setIsLanguageMenuOpen(false);
    closeMenu();
    window.location.reload();
  };

  const openExternal = (url: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    window.open(url, '_blank', 'noopener');
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    try {
      setIsSigningOut(true);
      await authClient.signOut();
      router.push('/sign-in');
      router.refresh();
    } catch (error: any) {
      const message = error?.error || error?.message || tAuth('signOutFailed');
      toast.error(message);
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSignIn = () => {
    if (typeof window === 'undefined') {
      return;
    }

    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = `/sign-in?next=${encodeURIComponent(currentLocation)}`;
    router.push(target);
  };

  const themeChoices: ThemeChoice[] = useMemo(
    () => [
      {
        value: 'light',
        label: tMenu('themeLight'),
        icon: Sun,
      },
      {
        value: 'dark',
        label: tMenu('themeDark'),
        icon: Moon,
      },
    ],
    [tMenu],
  );

  const activeLocaleLabel = useMemo(() => {
    const match = SUPPORTED_LOCALES.find((option) => option.code === currentLocale);
    return match?.label ?? currentLocale.toUpperCase();
  }, [currentLocale]);

  const clamp = (value: number, min: number, max: number) => {
    if (Number.isNaN(value)) {
      return min;
    }

    if (max < min) {
      return min;
    }

    return Math.min(Math.max(value, min), max);
  };

  const computeTop = () => {
    if (!triggerRect) {
      return 0;
    }

    const padding = 12;
    const desiredTop =
      panelPlacement === 'bottom'
        ? triggerRect.bottom + padding
        : triggerRect.top - panelHeight - padding;

    if (typeof window === 'undefined') {
      return desiredTop;
    }

    const viewportHeight = window.innerHeight;
    const minTop = padding;
    const maxTop = Math.max(padding, viewportHeight - panelHeight - padding);

    return clamp(desiredTop, minTop, maxTop);
  };

  const panelStyle: CSSProperties = triggerRect
    ? {
        top: computeTop(),
        left: triggerRect.left + triggerRect.width / 2,
        transform: 'translateX(-50%)',
      }
    : {
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -10%)',
      };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        className="flex flex-col items-center gap-1 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500 rounded-md"
        aria-label="Open profile menu"
      >
        <UserAvatar
          name={user.name}
          email={user.email}
          image={user.image}
          size="md"
        />
        <span className="hidden px-1 text-[10px] text-black/60 dark:text-white/60 lg:block">
          {displayName}
        </span>
        <span className="hidden px-1 text-[9px] uppercase tracking-wide text-black/40 dark:text-white/40 lg:block">
          {roleLabel}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50"
          >
            <div
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={closeMenu}
            />
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={MENU_TRANSITION}
              style={{
                ...panelStyle,
                width: 'min(320px, calc(100vw - 2rem))',
              }}
              className="absolute z-50 rounded-xl border border-light-200/80 bg-light-primary/95 p-4 text-left shadow-xl shadow-black/10 dark:border-dark-200/80 dark:bg-dark-primary/95"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-3 pb-3">
                <UserAvatar
                  name={user.name}
                  email={user.email}
                  image={user.image}
                  size="lg"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-black/80 dark:text-white/80">
                    {displayName}
                  </p>
                  <p className="text-xs text-black/50 dark:text-white/50">
                    {user.email}
                  </p>
                  <p className="text-xs text-black/40 dark:text-white/40">
                    {roleLabel}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                {user.role === USER_ROLES.ADMIN && (
                  <MenuButton
                    icon={Shield}
                    label={tMenu('adminDashboard')}
                    onClick={() => {
                      closeMenu();
                      router.push('/admin');
                    }}
                  />
                )}
                {isAnonymousUser && (
                  <MenuButton
                    icon={LogIn}
                    label="Sign in to save chats"
                    description="Log in or create an account to keep this session."
                    onClick={() => {
                      closeMenu();
                      handleSignIn();
                    }}
                  />
                )}
                <MenuButton
                  icon={Palette}
                  label={tMenu('theme')}
                  trailing={
                    mounted && (
                      <div className="flex items-center gap-2">
                        {themeChoices.map((choice) => (
                          <button
                            key={choice.value}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (theme !== choice.value) {
                                setTheme(choice.value);
                              }
                            }}
                            className={cn(
                              'flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition',
                              theme === choice.value
                                ? 'border-sky-500 bg-sky-500/10 text-sky-500'
                                : 'border-transparent bg-light-200/70 text-black/60 hover:bg-light-200 dark:border-transparent dark:bg-dark-200/80 dark:text-white/60 dark:hover:bg-dark-200',
                            )}
                          >
                            <choice.icon className="size-3" />
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    )
                  }
                />
                <MenuButton
                  icon={Zap}
                  label={tMenu('upgradePlan')}
                  onClick={() => {
                    closeMenu();
                    handleUpgradePlan();
                  }}
                />
                <MenuButton
                  icon={Bell}
                  label={tMenu('notifications')}
                  onClick={() => {
                    closeMenu();
                    handleNotifications();
                  }}
                />
                <MenuButton
                  icon={Settings2}
                  label={tMenu('chatPreferences')}
                  onClick={() => openSettingsSection('preferences')}
                />
                <MenuButton
                  icon={Sparkles}
                  label={tMenu('personalization')}
                  onClick={() => openSettingsSection('personalization')}
                />
                <MenuButton
                  icon={Languages}
                  label={tMenu('language')}
                  onClick={(event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    setIsLanguageMenuOpen((prev) => !prev);
                  }}
                  trailing={
                    <span className="text-xs text-black/60 dark:text-white/60">
                      {activeLocaleLabel}
                    </span>
                  }
                />
                {isLanguageMenuOpen ? (
                  <div className="ml-11 mt-1 flex flex-col gap-1">
                    {SUPPORTED_LOCALES.map((option) => {
                      const isActive = option.code === currentLocale;

                      return (
                        <button
                          key={option.code}
                          type="button"
                          onClick={(event: MouseEvent<HTMLButtonElement>) => {
                            event.stopPropagation();
                            handleLocaleSelection(option.code);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs transition',
                            isActive
                              ? 'bg-sky-500/10 text-sky-500 dark:bg-sky-500/20'
                              : 'text-black/70 hover:bg-light-200 dark:text-white/70 dark:hover:bg-dark-200',
                          )}
                        >
                          <span>{option.label}</span>
                          {isActive ? <Check className="size-3" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <MenuButton
                  icon={Command}
                  label={tMenu('keyboardShortcuts')}
                  onClick={() => {
                    closeMenu();
                    handleKeyboardShortcuts();
                  }}
                />
                <MenuButton
                  icon={Bug}
                  label={tMenu('reportAnIssue')}
                  onClick={() => {
                    closeMenu();
                    openExternal('https://github.com/RGPartners/soraai-chat/issues/new/choose');
                  }}
                />
                <MenuButton
                  icon={CircleHelp}
                  label={tMenu('help')}
                  onClick={() => {
                    closeMenu();
                    handleHelp();
                  }}
                />
                {!isAnonymousUser && (
                  <MenuButton
                    icon={Settings}
                    label={tMenu('userSettings')}
                    onClick={openAccountSettings}
                  />
                )}
              </div>

              <div className="mt-3 border-t border-light-200/70 pt-3 dark:border-dark-200/70">
                {!isAnonymousUser && (
                  <MenuButton
                    icon={LogOut}
                    label={isSigningOut ? tAuth('signingOut') : tAuth('signOut')}
                    onClick={() => {
                      closeMenu();
                      handleSignOut();
                    }}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsDialogue
            key={`settings-${settingsInitialSection ?? 'default'}`}
            isOpen={isSettingsOpen}
            setIsOpen={setIsSettingsOpen}
            canManageSettings={canManageSettings}
            initialSection={settingsInitialSection}
          />
        )}
      </AnimatePresence>

      {!isAnonymousUser && (
        <UserSettingsDialog
          open={isAccountDialogOpen}
          onClose={() => setIsAccountDialogOpen(false)}
          user={user}
        />
      )}
    </>
  );
};

const MenuButton = ({
  icon: Icon,
  label,
  description,
  onClick,
  trailing,
  disabled,
}: MenuButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
        'hover:bg-light-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500',
        'dark:hover:bg-dark-200/70 disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-black/60 dark:text-white/60" />
        <div className="flex flex-col">
          <span className="text-sm text-black/80 dark:text-white/80">{label}</span>
          {description ? (
            <span className="text-xs text-black/50 dark:text-white/50">
              {description}
            </span>
          ) : null}
        </div>
      </div>
      {trailing}
    </button>
  );
};

export default UserProfileMenu;
