import {Component, serialize} from '@layr/component';
import mri from 'mri';
import fsExtra from 'fs-extra';
import {createRequire} from 'module';
import 'source-map-support/register.js';

const require = createRequire(import.meta.url);

async function main() {
  const {componentGetterFile, outputFile} = (mri(process.argv.slice(2)) as unknown) as {
    componentGetterFile: string;
    outputFile: string;
  };

  const componentGetter = require(componentGetterFile).default;
  const rootComponent = (await componentGetter()) as typeof Component;

  const introspection = rootComponent.introspect();

  const serializedIntrospection = serialize(introspection, {serializeFunctions: true});

  fsExtra.writeJSONSync(outputFile, serializedIntrospection, {spaces: 2});

  console.log(`Root component introspected`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
