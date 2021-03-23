import {Component} from '@layr/component';
import {isStorableClass} from '@layr/storable';
import mri from 'mri';
import {createRequire} from 'module';
import 'source-map-support/register.js';

const require = createRequire(import.meta.url);

async function main() {
  const {componentGetterFile, databaseURL} = (mri(process.argv.slice(2)) as unknown) as {
    componentGetterFile: string;
    databaseURL: string;
  };

  const componentGetter = require(componentGetterFile).default;
  const rootComponent = (await componentGetter()) as typeof Component;

  let stores = new Set<any>();

  for (const component of [rootComponent, ...rootComponent.getProvidedComponents({deep: true})]) {
    if (
      isStorableClass(component) &&
      !component.isEmbedded() &&
      component.hasStore() &&
      component.getStore().getURL() === databaseURL
    ) {
      // TODO: Improve StoreLike typing to avoid the following 'any' casting
      const store = component.getStore() as any;

      if (store.getURL() === databaseURL) {
        await store.migrateStorable(component);
        stores.add(store);
      }
    }
  }

  for (const store of stores) {
    await store.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
