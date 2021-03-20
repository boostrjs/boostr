import fsExtra from 'fs-extra';
import {join} from 'path';

import {Subservice} from './sub.js';
import {bundle} from '../bundler.js';
import {SinglePageApplicationServer} from '../spa-server.js';
import {resolveVariables} from '../util.js';

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <title>Hello, Boostr!</title>
  </head>
  <body>
    <noscript><p>Sorry, this site requires JavaScript to be enabled.</p></noscript>
    <div id="root"></div>
    <script src="/{{bundleFileName}}"></script>
  </body>
</html>
`;

const BOOTSTRAP_TEMPLATE = `import componentGetter from '{{entryPoint}}';

async function main() {
  const Component = await componentGetter();
  console.log(Component);
}

main();
`;

export class WebFrontendService extends Subservice {
  static type = 'web-frontend';

  static help = 'Web frontend help...';

  // === Commands ===

  async build({watch = false}: {watch?: {afterRebuild?: () => void} | boolean} = {}) {
    await super.build();

    const directory = this.getDirectory();
    const serviceName = this.getName();
    const stage = this.getStage();
    const {environment, platform, build: buildConfig} = this.getConfig();

    const bundleFileName = 'bundle.js';

    await bundle({
      directory,
      serviceName,
      stage,
      environment,
      bootstrapTemplate: BOOTSTRAP_TEMPLATE,
      bundleFileName,
      sourceMap: buildConfig?.sourceMap ?? platform === 'local',
      minify: buildConfig?.minify ?? platform !== 'local',
      watch,
      esbuildOptions: {
        target: 'es2017',
        platform: 'browser',
        mainFields: ['browser', 'module', 'main']
      }
    });

    const buildDirectory = join(directory, 'build', stage);

    const htmlFile = join(buildDirectory, 'index.html');
    const htmlContent = resolveVariables(HTML_TEMPLATE, {bundleFileName});
    fsExtra.outputFileSync(htmlFile, htmlContent);

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

    const buildDirectory = await this.build({
      watch: {
        afterRebuild() {
          // TODO
        }
      }
    });

    const server = new SinglePageApplicationServer({directory: buildDirectory, serviceName, port});

    await server.start();
  }
}
