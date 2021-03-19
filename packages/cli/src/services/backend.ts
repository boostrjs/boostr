import esbuild from 'esbuild';
import {join} from 'path';

import {Subservice} from './sub.js';
import {ProcessController} from '../processes/index.js';
import {loadNPMPackage} from '../npm.js';

export class BackendService extends Subservice {
  static type = 'backend';

  static help = 'Backend help...';

  // === Commands ===

  async build({watch = false}: {watch?: {afterRebuild?: () => void} | boolean} = {}) {
    await super.build();

    const directory = this.getDirectory();
    const stage = this.getStage();

    const pkg = loadNPMPackage(directory);

    const entryPoint = pkg.main;

    if (entryPoint === undefined) {
      this.throwError(
        `A 'main' property is missing in a 'package.json' file (directory: '${directory}')`
      );
    }

    const bundleFile = join(directory, 'build', stage, 'bundle.cjs');

    try {
      await esbuild.build({
        absWorkingDir: directory,
        entryPoints: [entryPoint],
        outfile: bundleFile,
        target: 'node12',
        platform: 'node',
        mainFields: ['module', 'main'],
        bundle: true,
        sourcemap: true,
        ...(watch !== false && {
          watch: {
            onRebuild: (error) => {
              if (error) {
                this.logError('Rebuild failed');
              } else {
                this.logMessage('Rebuild succeeded');

                if (typeof watch === 'object' && watch.afterRebuild !== undefined) {
                  watch.afterRebuild();
                }
              }
            }
          }
        })
      });
    } catch {
      this.throwError('Build failed');
    }

    this.logMessage('Build succeeded');

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

    const {protocol, hostname, port: portString} = url;

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
