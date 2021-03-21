import fsExtra from 'fs-extra';
import {join} from 'path';

import {Subservice} from './sub.js';
import {bundle} from '../bundler.js';
import {ProcessController} from '../processes/index.js';

const BOOTSTRAP_TEMPLATE = `export {default} from '{{entryPoint}}';`;

export class BackendService extends Subservice {
  static type = 'backend';

  static help = 'Backend help...';

  // === Commands ===

  static commands = {
    ...Subservice.commands
  };

  async build({watch = false}: {watch?: {afterRebuild?: () => void} | boolean} = {}) {
    await super.build();

    const directory = this.getDirectory();
    const serviceName = this.getName();
    const stage = this.getStage();
    const {environment, platform, build: buildConfig} = this.getConfig();

    const buildDirectory = join(directory, 'build', stage);

    fsExtra.emptyDirSync(buildDirectory);

    const isLocal = platform === 'local';

    const bundleFile = await bundle({
      rootDirectory: directory,
      buildDirectory,
      bootstrapTemplate: BOOTSTRAP_TEMPLATE,
      serviceName,
      stage,
      environment,
      sourceMap: buildConfig?.sourceMap ?? isLocal,
      minify: buildConfig?.minify ?? !isLocal,
      watch,
      esbuildOptions: {
        target: 'node12',
        platform: 'node',
        mainFields: ['browser', 'module', 'main']
      }
    });

    return bundleFile;
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

    let processController: ProcessController;

    const bundleFile = await this.build({
      watch: {
        afterRebuild() {
          processController.restart();
        }
      }
    });

    processController = new ProcessController(
      'start-backend',
      ['--componentGetterFile', bundleFile, '--port', String(port)],
      {currentDirectory: directory, environment: config.environment, serviceName}
    );

    processController.start();
  }
}
