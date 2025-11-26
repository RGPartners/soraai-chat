import crypto from 'crypto';

import { Config, ConfigModelProvider, UIConfigSections } from './types';
import { hashObj } from '../serverUtils';
import { getModelProvidersUIConfigSection } from '../models/providers';
import logger from '@/lib/logger';
import { loadOpenAICompatibleProviders } from './openaiCompatible';

const configLogger = logger.withDefaults({ tag: 'config' });

class ConfigManager {
  configVersion = 1;
  private readonly chatCapableProviders = new Set([
    'openai',
    'anthropic',
    'gemini',
    'groq',
    'deepseek',
    'aiml',
    'lmstudio',
    'lemonade',
    'ollama',
  ]);

  private currentConfig: Config;
  private uiConfigSections: UIConfigSections;

  constructor() {
    this.uiConfigSections = this.buildUIConfigSections();
    this.currentConfig = this.buildInitialConfig();
    this.syncSetupCompletionState();
  }

  private buildUIConfigSections(): UIConfigSections {
    return {
      preferences: [
        {
          name: 'Theme',
          key: 'theme',
          type: 'select',
          options: [
            {
              name: 'Light',
              value: 'light',
            },
            {
              name: 'Dark',
              value: 'dark',
            },
          ],
          required: false,
          description: 'Choose between light and dark layouts for the app.',
          default: 'dark',
          scope: 'client',
        },
        {
          name: 'Measurement Unit',
          key: 'measureUnit',
          type: 'select',
          options: [
            {
              name: 'Imperial',
              value: 'Imperial',
            },
            {
              name: 'Metric',
              value: 'Metric',
            },
          ],
          required: false,
          description: 'Choose between Metric  and Imperial measurement unit.',
          default: 'Metric',
          scope: 'client',
        },
        {
          name: 'Auto video & image search',
          key: 'autoMediaSearch',
          type: 'switch',
          required: false,
          description: 'Automatically search for relevant images and videos.',
          default: true,
          scope: 'client',
        },
      ],
      personalization: [
        {
          name: 'System Instructions',
          key: 'systemInstructions',
          type: 'textarea',
          required: false,
          description: 'Add custom behavior or tone for the model.',
          placeholder:
            'e.g., "Respond in a friendly and concise tone" or "Use British English and format answers as bullet points."',
          scope: 'client',
        },
      ],
      modelProviders: getModelProvidersUIConfigSection(),
      search: [
        {
          name: 'SearXNG URL',
          key: 'searxngURL',
          type: 'string',
          required: false,
          description: 'The URL of your SearXNG instance',
          placeholder: 'http://localhost:4000',
          default: '',
          scope: 'server',
          env: 'SEARXNG_API_URL',
        },
      ],
    };
  }

  private buildInitialConfig(): Config {
    const providers = this.buildProvidersFromEnv();
    const search = this.buildSearchConfig();

    return {
      version: this.configVersion,
      setupComplete: this.hasChatProviderConfiguredInternal(providers),
      preferences: {},
      personalization: {},
      modelProviders: providers,
      search,
    };
  }

  private buildProvidersFromEnv(): ConfigModelProvider[] {
    const configuredProviders: ConfigModelProvider[] = [];
    const providerSections = this.uiConfigSections.modelProviders ?? [];

    providerSections.forEach((section) => {
      const config: Record<string, any> = {};
      const requiredKeys: string[] = [];

      section.fields.forEach((field) => {
        const value =
          (field.env ? process.env[field.env] : undefined) ??
          field.default ??
          '';
        config[field.key] = value;

        if (field.required) {
          requiredKeys.push(field.key);
        }
      });

      const isConfigured = requiredKeys.every((key) => this.hasValue(config[key]));

      if (!isConfigured) {
        if (requiredKeys.length > 0) {
          configLogger.debug(
            `Skipping provider ${section.name} because required environment variables are missing.`,
          );
        }
        return;
      }

      const hash = hashObj(config);
      const id = this.createStableProviderId(section.key, hash);

      configuredProviders.push({
        id,
        name: section.name,
        type: section.key,
        config,
        chatModels: [],
        embeddingModels: [],
        hash,
      });
    });

    const openaiCompatibleProviders = loadOpenAICompatibleProviders();

    openaiCompatibleProviders.forEach((provider) => {
      const config = {
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      };

      const hash = hashObj(config);
      const id = this.createStableProviderId(
        `openai-${this.sanitizeSegment(provider.provider)}`,
        hash,
      );

      configuredProviders.push({
        id,
        name: provider.provider,
        type: 'openai',
        config,
        chatModels: provider.models.map((model) => ({
          name: model.uiName,
          key: model.apiName,
        })),
        embeddingModels: [],
        hash,
      });
    });

    const deduped = new Map<string, ConfigModelProvider>();
    configuredProviders.forEach((provider) => {
      if (!deduped.has(provider.hash)) {
        deduped.set(provider.hash, provider);
      }
    });

    return Array.from(deduped.values());
  }

  private buildSearchConfig(): Config['search'] {
    return {
      searxngURL: process.env.SEARXNG_API_URL ?? '',
    };
  }

  private saveConfig() {
    // Configuration is sourced from environment variables and kept in-memory.
  }

  public getConfig(key: string, defaultValue?: any): any {
    const nested = key.split('.');
    let obj: any = this.currentConfig;

    for (let i = 0; i < nested.length; i++) {
      const part = nested[i];
      if (obj == null) return defaultValue;

      obj = obj[part];
    }

    return obj === undefined ? defaultValue : obj;
  }

  public updateConfig(key: string, val: any) {
    const parts = key.split('.');
    if (parts.length === 0) return;

    let target: any = this.currentConfig;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (target[part] === null || typeof target[part] !== 'object') {
        target[part] = {};
      }

      target = target[part];
    }

    const finalKey = parts[parts.length - 1];
    target[finalKey] = val;

    this.syncSetupCompletionState();
    this.saveConfig();
  }

  public addModelProvider(type: string, name: string, config: any) {
    const newModelProvider: ConfigModelProvider = {
      id: crypto.randomUUID(),
      name,
      type,
      config,
      chatModels: [],
      embeddingModels: [],
      hash: hashObj(config),
    };

    this.currentConfig.modelProviders.push(newModelProvider);
    this.syncSetupCompletionState();
    this.saveConfig();

    return newModelProvider;
  }

  public removeModelProvider(id: string) {
    const index = this.currentConfig.modelProviders.findIndex(
      (p) => p.id === id,
    );

    if (index === -1) return;

    this.currentConfig.modelProviders =
      this.currentConfig.modelProviders.filter((p) => p.id !== id);

    this.syncSetupCompletionState();
    this.saveConfig();
  }

  public async updateModelProvider(id: string, name: string, config: any) {
    const provider = this.currentConfig.modelProviders.find((p) => {
      return p.id === id;
    });

    if (!provider) throw new Error('Provider not found');

    provider.name = name;
    provider.config = config;

    this.syncSetupCompletionState();
    this.saveConfig();

    return provider;
  }

  public addProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    model: any,
  ) {
    const provider = this.currentConfig.modelProviders.find(
      (p) => p.id === providerId,
    );

    if (!provider) throw new Error('Invalid provider id');

    delete model.type;

    if (type === 'chat') {
      provider.chatModels.push(model);
    } else {
      provider.embeddingModels.push(model);
    }

    this.syncSetupCompletionState();
    this.saveConfig();

    return model;
  }

  public removeProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    modelKey: string,
  ) {
    const provider = this.currentConfig.modelProviders.find(
      (p) => p.id === providerId,
    );

    if (!provider) throw new Error('Invalid provider id');

    if (type === 'chat') {
      provider.chatModels = provider.chatModels.filter(
        (m) => m.key !== modelKey,
      );
    } else {
      provider.embeddingModels = provider.embeddingModels.filter(
        (m) => m.key !== modelKey,
      );
    }

    this.syncSetupCompletionState();
    this.saveConfig();
  }

  public isSetupComplete() {
    return this.currentConfig.setupComplete;
  }

  public markSetupComplete() {
    if (!this.hasChatProviderConfigured()) {
      throw new Error(
        'At least one chat-capable provider must be configured before completing setup.',
      );
    }

    if (!this.currentConfig.setupComplete) {
      this.currentConfig.setupComplete = true;
    }

    this.saveConfig();
  }

  public getUIConfigSections(): UIConfigSections {
    return this.uiConfigSections;
  }

  public getCurrentConfig(): Config {
    return JSON.parse(JSON.stringify(this.currentConfig));
  }

  public hasChatProviderConfigured(): boolean {
    return this.hasChatProviderConfiguredInternal(
      this.currentConfig.modelProviders,
    );
  }

  private hasChatProviderConfiguredInternal(
    providers: ConfigModelProvider[],
  ): boolean {
    return providers.some((provider) => this.isChatProviderConfigured(provider));
  }

  private isChatProviderConfigured(provider: ConfigModelProvider) {
    if (!this.chatCapableProviders.has(provider.type)) {
      return false;
    }

    const configValues = Object.values(provider.config ?? {});
    return configValues.some((value) => this.hasValue(value));
  }

  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }

    return Boolean(value);
  }

  private syncSetupCompletionState() {
    this.currentConfig.setupComplete = this.hasChatProviderConfiguredInternal(
      this.currentConfig.modelProviders,
    );
  }

  private createStableProviderId(prefix: string, hash: string): string {
    const segment = this.sanitizeSegment(prefix);
    return `${segment}-${hash.slice(0, 8)}`;
  }

  private sanitizeSegment(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'provider';
  }
}

const configManager = new ConfigManager();

export default configManager;
