import { ConfigModelProvider } from '../config/types';
import BaseModelProvider, {
  createProviderInstance,
} from './providers/baseProvider';
import { getConfiguredModelProviders } from '../config/serverRegistry';
import { providers } from './providers';
import { MinimalProvider, ModelList } from './types';
import configManager from '../config';
import logger from '@/lib/logger';

const modelRegistryLogger = logger.withDefaults({ tag: 'models:registry' });

class ModelRegistry {
  activeProviders: (ConfigModelProvider & {
    provider: BaseModelProvider<any>;
  })[] = [];

  constructor() {
    this.initializeActiveProviders();
  }

  private initializeActiveProviders() {
    const configuredProviders = getConfiguredModelProviders();

    configuredProviders.forEach((p) => {
      try {
        const provider = providers[p.type];
        if (!provider) throw new Error('Invalid provider type');

        this.activeProviders.push({
          ...p,
          provider: createProviderInstance(provider, p.id, p.name, p.config),
        });
        modelRegistryLogger.debug('Initialized model provider.', {
          type: p.type,
          id: p.id,
          name: p.name,
        });
      } catch (error) {
        modelRegistryLogger.error('Failed to initialize provider.', {
          type: p.type,
          id: p.id,
          config: p.config,
          error,
        });
      }
    });
  }

  async getActiveProviders() {
    const providers: MinimalProvider[] = [];

    await Promise.all(
      this.activeProviders.map(async (p) => {
        let m: ModelList = { chat: [], embedding: [] };

        try {
          m = await p.provider.getModelList();
        } catch (error: any) {
          modelRegistryLogger.error('Failed to get model list.', {
            type: p.type,
            id: p.id,
            error,
          });

          m = {
            chat: [
              {
                key: 'error',
                name: error.message,
              },
            ],
            embedding: [],
          };
        }

        providers.push({
          id: p.id,
          name: p.name,
          chatModels: m.chat,
          embeddingModels: m.embedding,
        });
      }),
    );

    return providers;
  }

  async loadChatModel(providerId: string, modelName: string) {
    const provider = this.activeProviders.find((p) => p.id === providerId);

    if (!provider) throw new Error('Invalid provider id');

    const model = await provider.provider.loadChatModel(modelName);

    return model;
  }

  async loadEmbeddingModel(providerId: string, modelName: string) {
    const provider = this.activeProviders.find((p) => p.id === providerId);

    if (!provider) throw new Error('Invalid provider id');

    const model = await provider.provider.loadEmbeddingModel(modelName);

    return model;
  }

  async addProvider(
    type: string,
    name: string,
    config: Record<string, any>,
  ): Promise<ConfigModelProvider> {
    const provider = providers[type];
    if (!provider) throw new Error('Invalid provider type');

    const newProvider = configManager.addModelProvider(type, name, config);

    const instance = createProviderInstance(
      provider,
      newProvider.id,
      newProvider.name,
      newProvider.config,
    );

    let m: ModelList = { chat: [], embedding: [] };

    try {
      m = await instance.getModelList();
    } catch (error: any) {
      modelRegistryLogger.error(
        'Failed to get model list for newly added provider.',
        {
          type,
          id: newProvider.id,
          error,
        },
      );

      m = {
        chat: [
          {
            key: 'error',
            name: error.message,
          },
        ],
        embedding: [],
      };
    }

    this.activeProviders.push({
      ...newProvider,
      provider: instance,
    });

    return {
      ...newProvider,
      chatModels: m.chat || [],
      embeddingModels: m.embedding || [],
    };
  }

  async removeProvider(providerId: string): Promise<void> {
    configManager.removeModelProvider(providerId);
    this.activeProviders = this.activeProviders.filter(
      (p) => p.id !== providerId,
    );

    return;
  }

  async updateProvider(
    providerId: string,
    name: string,
    config: any,
  ): Promise<ConfigModelProvider> {
    const updated = await configManager.updateModelProvider(
      providerId,
      name,
      config,
    );
    const instance = createProviderInstance(
      providers[updated.type],
      providerId,
      name,
      config,
    );

    let m: ModelList = { chat: [], embedding: [] };

    try {
      m = await instance.getModelList();
    } catch (error: any) {
      modelRegistryLogger.error(
        'Failed to get model list for updated provider.',
        {
          type: updated.type,
          id: updated.id,
          error,
        },
      );

      m = {
        chat: [
          {
            key: 'error',
            name: error.message,
          },
        ],
        embedding: [],
      };
    }

    this.activeProviders.push({
      ...updated,
      provider: instance,
    });

    return {
      ...updated,
      chatModels: m.chat || [],
      embeddingModels: m.embedding || [],
    };
  }

  /* Using async here because maybe in the future we might want to add some validation?? */
  async addProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    model: any,
  ): Promise<any> {
    const addedModel = configManager.addProviderModel(providerId, type, model);
    return addedModel;
  }

  async removeProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    modelKey: string,
  ): Promise<void> {
    configManager.removeProviderModel(providerId, type, modelKey);
    return;
  }
}

export default ModelRegistry;
