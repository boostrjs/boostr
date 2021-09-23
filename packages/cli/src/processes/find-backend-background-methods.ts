import type {Component} from '@layr/component';
import mri from 'mri';
import {createRequire} from 'module';
import fsExtra from 'fs-extra';
import 'source-map-support/register.js';

import {findBackgroundMethods} from '../component.js';

const require = createRequire(import.meta.url);

async function main() {
  const {componentGetterFile, serviceName: _, outputFile} = (mri(
    process.argv.slice(2)
  ) as unknown) as {
    componentGetterFile: string;
    serviceName: string;
    outputFile: string;
  };

  const componentGetter = require(componentGetterFile).default;
  const rootComponent = (await componentGetter()) as typeof Component;

  const output = findBackgroundMethods(rootComponent);

  fsExtra.writeJSONSync(outputFile, output, {spaces: 2});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
