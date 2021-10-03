import type {Component} from '@layr/component';
import {ComponentServer} from '@layr/component-server';
import {ComponentHTTPServer} from '@layr/component-http-server';
import {ExecutionQueue} from '@layr/execution-queue';
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

  // === Handle method scheduling ===

  for (const {scheduling, query} of findBackgroundMethods(rootComponent)) {
    if (!scheduling) {
      continue;
    }

    setInterval(() => {
      componentServer.receive({query}, {executionMode: 'background'});
    }, scheduling.rate);
  }

  // === Handle method queueing ===

  const executionQueue = new ExecutionQueue(async (query) => {
    componentServer.receive({query}, {executionMode: 'background'});
  });

  executionQueue.registerRootComponent(rootComponent);

  // === Handle HTTP server ===

  const httpServer = new ComponentHTTPServer(componentServer, {port: Number(portString)});
  await httpServer.start();

  console.log(`Component HTTP server started at http://localhost:${portString}/`);

  process.send!('started');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
