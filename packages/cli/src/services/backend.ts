import esbuild from 'esbuild';
import {join} from 'path';

import {Subservice} from './sub.js';
import {ProcessController} from '../processes/index.js';
import {loadNPMPackage} from '../npm.js';

export class BackendService extends Subservice {
  static type = 'backend';

  static help = 'Backend help...';

  // === Commands ===

  async start() {
    await super.start();

    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    const url: string = config.url;

    if (!url) {
      this.throwError(
        `A 'url' property is required to start a local server (directory: '${directory}')`
      );
    }

    let port: number;

    try {
      port = Number(new URL(url).port);

      if (!port) {
        throw new Error(`'port' is missing`);
      }
    } catch (error) {
      this.throwError(
        `Couldn't determine the port where to start the local server {url: '${url}'}`
      );
    }

    const pkg = loadNPMPackage(directory);

    const entryPoint = pkg.main;

    if (entryPoint === undefined) {
      this.throwError(
        `A 'main' property is missing in a 'package.json' file (directory: '${directory}')`
      );
    }

    const bundleFile = join(directory, 'build', 'bundle.cjs');

    const processController = new ProcessController(
      'start-backend',
      ['--componentGetterFile', bundleFile, '--port', String(port)],
      {currentDirectory: directory, environment: config.environment, serviceName}
    );

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
        watch: {
          onRebuild: (error) => {
            if (error) {
              this.logError('Rebuild failed');
            } else {
              this.logMessage('Rebuild succeeded');
              processController.restart();
            }
          }
        }
      });
    } catch {
      this.throwError('Build failed');
    }

    this.logMessage('Build succeeded');

    processController.start();
  }
}
