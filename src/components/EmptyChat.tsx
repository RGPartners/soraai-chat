'use client';

import EmptyChatMessageInput from './EmptyChatMessageInput';
import RatesWidget from './RatesWidget';
import NewsArticleWidget from './NewsArticleWidget';
import SettingsButtonMobile from '@/components/Settings/SettingsButtonMobile';
import ChatGreeting from '@/components/ChatGreeting';
import { type SupportedLocaleCode } from '@/lib/constants/locales';

type EmptyChatProps = {
  canManageSettings?: boolean;
  locale: SupportedLocaleCode;
  displayName?: string | null;
};

const EmptyChat = ({ canManageSettings, locale, displayName }: EmptyChatProps) => {
  return (
    <div className="relative">
      <div className="absolute w-full flex flex-row items-center justify-end mr-5 mt-5">
        <SettingsButtonMobile canManageSettings={canManageSettings} />
      </div>
      <div className="flex flex-col items-center justify-center min-h-screen max-w-screen-sm mx-auto p-2 space-y-4">
        <div className="flex flex-col items-center justify-center w-full space-y-8">
          <div className="w-full -mt-8">
            <ChatGreeting locale={locale} displayName={displayName} />
          </div>
          <EmptyChatMessageInput />
        </div>
        <div className="flex flex-col w-full gap-4 mt-2 sm:flex-row sm:justify-center">
          <div className="flex-1 w-full">
            <RatesWidget />
          </div>
          <div className="flex-1 w-full">
            <NewsArticleWidget />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmptyChat;
