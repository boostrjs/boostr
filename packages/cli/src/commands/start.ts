import esbuild from 'esbuild';
import {join} from 'path';

import type {Command} from './index.js';
import {ProcessController} from '../processes/index.js';
import {loadNPMPackage} from '../npm.js';
import {logMessage, logError, throwError} from '../util.js';

export default {
  name: 'start',
  options: {
    help: {
      aliases: ['h']
    }
  },
  async handler([], {help}: {help?: boolean}, {directory, config, componentName}) {
    if (help) {
      console.log('Start help...'); // TODO
      return;
    }

    if (config === undefined) {
      throwError(`Couldn't find a Boostr configuration file`);
    }

    await start({directory, config, componentName});
  }
} as Command;

export async function start({
  directory,
  config,
  componentName
}: {
  directory: string;
  config: any;
  componentName?: string;
}) {
  if (config.type !== 'backend') {
    throwError(`The '${config.type}' configuration type is not yet supported`);
  }

  const url: string = config.url;

  if (!url) {
    throwError(`A 'url' property is required to start a local server (directory: '${directory}')`);
  }

  let port: number;

  try {
    port = Number(new URL(url).port);

    if (!port) {
      throw new Error(`'port' is missing`);
    }
  } catch (error) {
    throwError(`Couldn't determine the port where to start the local server {url: '${url}'}`);
  }

  const pkg = loadNPMPackage(directory);

  const entryPoint = pkg.main;

  if (entryPoint === undefined) {
    throwError(`A 'main' property is missing in a 'package.json' file (directory: '${directory}')`);
  }

  const bundleFile = join(directory, 'build', 'bundle.cjs');

  const processController = new ProcessController(
    'start-backend',
    ['--componentGetterFile', bundleFile, '--port', String(port)],
    {currentDirectory: directory, environment: config.environment, componentName}
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
        onRebuild(error, _result) {
          if (error) {
            logError('Rebuild failed', {componentName});
          } else {
            logMessage('Rebuild succeeded', {componentName});
            processController.restart();
          }
        }
      }
    });
  } catch {
    throwError('Build failed', {componentName});
  }

  logMessage('Build succeeded', {componentName});

  processController.start();
}
