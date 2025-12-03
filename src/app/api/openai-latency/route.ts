import { getSessionFromRequest } from '@/lib/auth/session';
import { getConfiguredModelProviders } from '@/lib/config/serverRegistry';
import { defaultChatModelKey } from '@/lib/config/features';
import ModelRegistry from '@/lib/models/registry';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const config = {
  regions: ['iad1'],
};

const latencyLogger = logger.withDefaults({ tag: 'api:openai-latency' });

const resolveDefaultChatModel = () => {
  const providers = getConfiguredModelProviders();

  if (!providers || providers.length === 0) {
    throw new Error('No model providers are configured');
  }

  const preferredModelKey =
    process.env.DEFAULT_CHAT_MODEL_KEY ??
    process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL_KEY ??
    defaultChatModelKey;

  const providerWithPreferredModel = providers.find((provider) =>
    (provider.chatModels ?? []).some((model) => model.key === preferredModelKey),
  );

  if (providerWithPreferredModel) {
    return { providerId: providerWithPreferredModel.id, modelKey: preferredModelKey };
  }

  const fallbackProvider = providers.find(
    (provider) => (provider.chatModels ?? []).length > 0,
  );

  if (!fallbackProvider) {
    throw new Error('No chat models are available on the configured providers');
  }

  const fallbackModelKey = fallbackProvider.chatModels![0]?.key;

  if (!fallbackModelKey) {
    throw new Error('Selected provider does not expose any chat model keys');
  }

  return { providerId: fallbackProvider.id, modelKey: fallbackModelKey };
};

export const GET = async (req: Request) => {
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { providerId, modelKey } = resolveDefaultChatModel();

    const registry = new ModelRegistry();
    const llm = await registry.loadChatModel(providerId, modelKey);

    const prompt = 'Reply with the single word "pong".';

    const invokeStart = Date.now();
    const response = await llm.invoke(prompt);
    const invokeDurationMs = Date.now() - invokeStart;

    const content =
      typeof response === 'string'
        ? response
        : Array.isArray((response as any)?.content)
          ? (response as any).content.map((part: any) => part?.text ?? '').join(' ')
          : (response as any)?.content ?? '';

    latencyLogger.info('OpenAI latency probe completed', {
      providerId,
      modelKey,
      durationMs: invokeDurationMs,
    });

    return Response.json(
      {
        providerId,
        modelKey,
        durationMs: invokeDurationMs,
        response: content,
      },
      { status: 200 },
    );
  } catch (error) {
    latencyLogger.error('OpenAI latency probe failed', error);
    return Response.json(
      {
        message: 'Failed to measure OpenAI latency',
      },
      { status: 500 },
    );
  }
};
