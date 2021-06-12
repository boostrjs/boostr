import type {Component} from '@layr/component';
import repl from 'repl';
import mri from 'mri';
import {createRequire} from 'module';
import 'source-map-support/register.js';

import {logMessage} from '../utilities.js';

const require = createRequire(import.meta.url);

async function main() {
  const {componentGetterFile, serviceName} = (mri(process.argv.slice(2)) as unknown) as {
    componentGetterFile: string;
    serviceName: string;
  };

  const componentGetter = require(componentGetterFile).default;
  const rootComponent = (await componentGetter()) as typeof Component;
  const rootComponentName = rootComponent.getComponentName();

  logMessage(
    `Starting a REPL with the root component \`${rootComponentName}\` exposed globally...`,
    {serviceName}
  );

  const replInstance = repl.start({useGlobal: true});

  replInstance.context[rootComponentName] = rootComponent;

  replInstance.on('exit', () => {
    process.exit();
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
