import type {Component} from '@layr/component';
import mri from 'mri';
import {createRequire} from 'module';
import 'source-map-support/register.js';

const require = createRequire(import.meta.url);

async function main() {
  const {componentGetterFile, serviceName: _, code} = (mri(process.argv.slice(2)) as unknown) as {
    componentGetterFile: string;
    serviceName: string;
    code: string;
  };

  const componentGetter = require(componentGetterFile).default;
  const rootComponent = (await componentGetter()) as typeof Component;
  const rootComponentName = rootComponent.getComponentName();

  const func = new Function(
    'rootComponent',
    `const ${rootComponentName} = rootComponent; return ${code};`
  );

  console.log(`Evaluating code...`);

  const result = await func(rootComponent);

  console.log(`Result:`);
  console.log(JSON.stringify(result, undefined, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
