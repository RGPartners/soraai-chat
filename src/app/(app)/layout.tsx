import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import SetupWizard from '@/components/Setup/SetupWizard';
import configManager from '@/lib/config';
import { ChatProvider } from '@/lib/hooks/useChat';
import { getSession } from '@/lib/auth/server';
import { USER_ROLES, getPrimaryRole } from '@/lib/auth/roles';
import ModelRegistry from '@/lib/models/registry';
import { syncUserProfileFromProviders } from '@/lib/user/profile-sync';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/sign-in');
  }

  const setupComplete = configManager.isSetupComplete();
  const configSections = configManager.getUIConfigSections();
  const registry = new ModelRegistry();
  const activeProviders = await registry.getActiveProviders();
  const hasChatProvider = activeProviders.some((provider) =>
    provider.chatModels.some((model) => model.key !== 'error'),
  );

  if (!setupComplete || !hasChatProvider) {
    return <SetupWizard configSections={configSections} />;
  }

  const primaryRole = getPrimaryRole(session.user.role);
  const isAnonymous = Boolean(session.user.isAnonymous);
  const fallbackEmail = session.user.email ?? `${session.user.id}@guest.local`;

  const profile = isAnonymous
    ? {
        name: 'Guest',
        email: fallbackEmail,
        image: session.user.image ?? null,
      }
    : await syncUserProfileFromProviders(session.user);

  const currentUser = {
    id: session.user.id,
    email: profile.email,
    name: profile.name ?? profile.email,
    role: primaryRole,
    image: profile.image,
    isAnonymous,
  };

  const canManageSettings =
    primaryRole === USER_ROLES.ADMIN || primaryRole === USER_ROLES.EDITOR;

  return (
    <ChatProvider>
      <Sidebar
        currentUser={currentUser}
        canManageSettings={canManageSettings}
      >
        {children}
      </Sidebar>
    </ChatProvider>
  );
}
