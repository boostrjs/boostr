import {Component} from '@layr/component';
import {ComponentServer} from '@layr/component-server';
import {ComponentHTTPServer} from '@layr/component-http-server';
import mri from 'mri';
import {createRequire} from 'module';
import 'source-map-support/register.js';

const require = createRequire(import.meta.url);

async function main() {
  const {componentGetterFile, port: portString} = (mri(process.argv.slice(2)) as unknown) as {
    componentGetterFile: string;
    port: string;
  };

  const componentGetter = require(componentGetterFile).default;
  const component = (await componentGetter()) as typeof Component;

  const server = new ComponentServer(component);
  const httpServer = new ComponentHTTPServer(server, {port: Number(portString)});
  await httpServer.start();

  console.log(`Component HTTP server started at http://localhost:${portString}/`);

  process.send!('started');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
