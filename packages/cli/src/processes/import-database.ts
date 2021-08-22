import {Component, deserialize} from '@layr/component';
import {StorableComponent, isStorableClass} from '@layr/storable';
import mri from 'mri';
import fsExtra from 'fs-extra';
import {createRequire} from 'module';
import 'source-map-support/register.js';

const require = createRequire(import.meta.url);

async function main() {
  const {componentGetterFile, databaseURL, inputFile} = (mri(process.argv.slice(2)) as unknown) as {
    componentGetterFile: string;
    databaseURL: string;
    inputFile: string;
  };

  const componentGetter = require(componentGetterFile).default;
  const rootComponent = (await componentGetter()) as typeof Component;

  const serializedStorables = fsExtra.readJSONSync(inputFile);

  const importedStorables = deserialize(serializedStorables, {
    rootComponent
  }) as StorableComponent[];

  let stores = new Set<any>();

  for (const component of [rootComponent, ...rootComponent.getProvidedComponents({deep: true})]) {
    if (isStorableClass(component) && !component.isEmbedded() && component.hasStore()) {
      const storableClass = component;

      const store = storableClass.getStore();

      if (store.getURL() !== databaseURL) {
        continue;
      }

      for (const importedStorable of importedStorables) {
        if (importedStorable.constructor !== storableClass) {
          continue;
        }

        console.log(
          `Importing \`${storableClass.getComponentName()}\` instance (id: '${importedStorable
            .getPrimaryIdentifierAttribute()
            .getValue()}')`
        );

        importedStorable.markAsNew();

        await store.save(importedStorable);
      }

      stores.add(store);
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
