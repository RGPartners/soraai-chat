import './load-env';
import ModelRegistry from '../src/lib/models/registry';

(async () => {
  const registry = new ModelRegistry();
  const providers = registry.activeProviders.map((provider) => ({
    id: provider.id,
    name: provider.name,
    type: provider.type,
  }));

  console.log(JSON.stringify(providers, null, 2));
})();
