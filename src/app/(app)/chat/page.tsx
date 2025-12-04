import ChatWindow from '@/components/ChatWindow';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat - Sora AI',
  description: 'Chat with Sora AI, the Rwanda tax compliance assistant.',
};

const ChatPage = () => {
  return <ChatWindow />;
};

export default ChatPage;
