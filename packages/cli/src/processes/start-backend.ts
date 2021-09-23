import {deserialize} from '@layr/component';
import type {Component} from '@layr/component';
import {ComponentServer} from '@layr/component-server';
import {ComponentHTTPServer} from '@layr/component-http-server';
import mri from 'mri';
import {createRequire} from 'module';
import 'source-map-support/register.js';

import {findBackgroundMethods} from '../component.js';

const require = createRequire(import.meta.url);

async function main() {
  const {componentGetterFile, port: portString} = (mri(process.argv.slice(2)) as unknown) as {
    componentGetterFile: string;
    port: string;
  };

  const componentGetter = require(componentGetterFile).default;
  const rootComponent = (await componentGetter()) as typeof Component;

  const componentServer = new ComponentServer(rootComponent);

  // === Handle HTTP server ===

  const httpServer = new ComponentHTTPServer(componentServer, {port: Number(portString)});
  await httpServer.start();

  console.log(`Component HTTP server started at http://localhost:${portString}/`);

  // === Handle scheduled method ===

  for (const {path, schedule, query} of findBackgroundMethods(rootComponent)) {
    if (schedule === undefined) {
      continue;
    }

    setInterval(async () => {
      const {result: serializedResult} = await componentServer.receive({query});

      deserialize(serializedResult, {
        rootComponent: rootComponent.fork(),
        errorHandler(error) {
          console.error(
            `An error occurred while running the scheduled method '${path}': ${error.message}`
          );
        },
        source: 'server'
      });
    }, schedule.rate);
  }

  process.send!('started');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
