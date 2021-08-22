import {Component, serialize} from '@layr/component';
import {StorableComponent, isStorableClass} from '@layr/storable';
import mri from 'mri';
import fsExtra from 'fs-extra';
import {createRequire} from 'module';
import 'source-map-support/register.js';

const require = createRequire(import.meta.url);

async function main() {
  const {componentGetterFile, databaseURL, outputFile} = (mri(
    process.argv.slice(2)
  ) as unknown) as {
    componentGetterFile: string;
    databaseURL: string;
    outputFile: string;
  };

  const componentGetter = require(componentGetterFile).default;
  const rootComponent = (await componentGetter()) as typeof Component;

  const exportedStorables: StorableComponent[] = [];

  let stores = new Set<any>();

  for (const component of [rootComponent, ...rootComponent.getProvidedComponents({deep: true})]) {
    if (isStorableClass(component) && !component.isEmbedded() && component.hasStore()) {
      const storableClass = component;

      const store = storableClass.getStore();

      if (store.getURL() !== databaseURL) {
        continue;
      }

      const foundStorables = await store.find(storableClass);

      for (const foundStorable of foundStorables) {
        console.log(
          `Exporting \`${storableClass.getComponentName()}\` instance (id: '${foundStorable
            .getPrimaryIdentifierAttribute()
            .getValue()}')`
        );

        await store.load(foundStorable);

        exportedStorables.push(foundStorable);
      }

      stores.add(store);
    }
  }

  for (const store of stores) {
    await store.disconnect();
  }

  const serializedStorables = serialize(exportedStorables);

  fsExtra.writeJSONSync(outputFile, serializedStorables, {spaces: 2});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
