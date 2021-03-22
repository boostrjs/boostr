import fsExtra from 'fs-extra';
import {join, dirname, basename, extname} from 'path';
import walkSync from 'walk-sync';

import {Subservice} from './sub.js';
import {bundle} from '../bundler.js';
import {SinglePageApplicationServer} from '../spa-server.js';
import {resolveVariables, generateHashFromFile} from '../util.js';

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <title>Hello, Boostr!</title>
    <link rel="icon" href="{{iconURL}}" />
  </head>
  <body>
    <noscript><p>Sorry, this site requires JavaScript to be enabled.</p></noscript>
    <div id="root"></div>
    <script src="{{bundleURL}}"></script>
  </body>
</html>
`;

const BOOTSTRAP_TEMPLATE = `
import React from 'react';
import ReactDOM from 'react-dom';
import {useBrowserRouter} from '@layr/react-integration';

import componentGetter from '{{entryPoint}}';

async function main() {
  let content;

  try {
    const Component = await componentGetter();

    const RootView = () => {
      const [router, isReady] = useBrowserRouter(Component);

      if (!isReady) {
        return null;
      }

      const content = router.callCurrentRoute({
        fallback: () => 'Route not found'
      });

      return content;
    }

    content = React.createElement(RootView);
  } catch (err) {
    console.error(err);

    content = React.createElement('pre', undefined, err.stack);
  }

  ReactDOM.render(content, document.getElementById('root'));
}

main().catch((error) => {
  console.error(error);
});
`;

const BOOTSTRAP_LOCAL = `
function openWebSocket(isFirstTime = true) {
  const webSocket = new WebSocket('ws://' + window.location.host);

  webSocket.addEventListener('open', () => {
    if (!isFirstTime) {
      window.location.reload();
    }
  });

  webSocket.addEventListener('message', (event) => {
    if (event.data === 'restart') {
      window.location.reload();
    }
  });

  webSocket.addEventListener('close', () => {
    setTimeout(() => { openWebSocket(false); }, 10000); // 10 seconds
  });
}

openWebSocket();
`;

const PUBLIC_DIRECTORY_NAME = 'public';
const IMMUTABLE_EXTENSION = '.immutable';

export class WebFrontendService extends Subservice {
  static type = 'web-frontend';

  static help = 'Web frontend help...';

  // === Commands ===

  static commands = {
    ...Subservice.commands,

    freeze: {
      async handler(this: WebFrontendService) {
        await this.freeze();
      },
      help: 'Freeze help...'
    }
  };

  async build({watch = false}: {watch?: {afterRebuild?: () => void} | boolean} = {}) {
    await super.build();

    const directory = this.getDirectory();
    const serviceName = this.getName();
    const stage = this.getStage();
    const {environment, iconURL, platform, build: buildConfig} = this.getConfig();

    if (!iconURL) {
      this.throwError(
        `Couldn't find an 'iconURL' property in the configuration (directory: '${directory}')`
      );
    }

    const buildDirectory = join(directory, 'build', stage);

    fsExtra.emptyDirSync(buildDirectory);

    const isLocal = platform === 'local';

    let bootstrapTemplate = BOOTSTRAP_TEMPLATE;

    if (isLocal) {
      bootstrapTemplate += BOOTSTRAP_LOCAL;
    }

    const bundleFile = await bundle({
      rootDirectory: directory,
      buildDirectory,
      bootstrapTemplate,
      serviceName,
      stage,
      environment,
      sourceMap: buildConfig?.sourceMap ?? isLocal,
      minify: buildConfig?.minify ?? !isLocal,
      watch,
      freeze: !isLocal,
      esbuildOptions: {
        target: 'es2017',
        platform: 'browser',
        mainFields: ['browser', 'module', 'main']
      }
    });

    const htmlFile = join(buildDirectory, 'index.html');
    const bundleFileName = basename(bundleFile);
    const htmlContent = resolveVariables(HTML_TEMPLATE, {iconURL, bundleURL: `/${bundleFileName}`});
    fsExtra.outputFileSync(htmlFile, htmlContent);

    const publicDirectory = join(directory, PUBLIC_DIRECTORY_NAME);
    fsExtra.copySync(publicDirectory, buildDirectory);

    return buildDirectory;
  }

  async start() {
    await super.start();

    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    if (config.platform !== 'local') {
      return;
    }

    if (!config.url) {
      this.throwError(
        `A 'url' property is required in the configuration to start a local server (directory: '${directory}')`
      );
    }

    let url: URL;

    try {
      url = new URL(config.url);
    } catch {
      this.throwError(
        `An error occurred while parsing the 'url' property in the configuration (directory: '${directory}')`
      );
    }

    const {protocol, hostname, port: portString, pathname} = url;

    if (protocol !== 'http:') {
      this.throwError(
        `The 'url' property in the configuration should start with 'http://' (directory: '${directory}')`
      );
    }

    if (hostname !== 'localhost') {
      this.throwError(
        `The host of the 'url' property in the configuration should be 'localhost' (directory: '${directory}')`
      );
    }

    const port = Number(portString);

    if (!port) {
      this.throwError(
        `The 'url' property in the configuration should specify a port (directory: '${directory}')`
      );
    }

    if (pathname !== '/') {
      this.throwError(
        `The path of the 'url' property in the configuration should be '/' (directory: '${directory}')`
      );
    }

    let server: SinglePageApplicationServer;

    const buildDirectory = await this.build({
      watch: {
        afterRebuild() {
          server.restartClients();
        }
      }
    });

    server = new SinglePageApplicationServer({directory: buildDirectory, serviceName, port});

    await server.start();
  }

  async freeze() {
    const publicDirectory = join(this.getDirectory(), PUBLIC_DIRECTORY_NAME);

    const files = walkSync(publicDirectory, {directories: false, includeBasePath: true});

    for (const file of files) {
      const directory = dirname(file);
      const fileName = basename(file);
      const extension = extname(fileName);
      const fileNameWithoutExtension = fileName.slice(0, -extension.length);

      if (fileName.endsWith(IMMUTABLE_EXTENSION + extension)) {
        continue;
      }

      const hash = generateHashFromFile(file);
      const newFileName = fileNameWithoutExtension + '-' + hash + IMMUTABLE_EXTENSION + extension;
      const newFile = join(directory, newFileName);

      fsExtra.moveSync(file, newFile, {overwrite: true});

      this.logMessage(`File frozen ('${fileName}' -> '${newFileName}')`);
    }
  }
}
