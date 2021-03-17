import {existsSync} from 'fs';
import {join, resolve} from 'path';

import type {Command} from './index.js';
import {runNPM} from '../npm.js';
import {throwError} from '../util.js';

export default {
  name: 'install',
  options: {
    help: {
      aliases: ['h']
    }
  },
  async handler([], {help}: {help?: boolean}, {directory, config}) {
    if (help) {
      console.log('Install help...'); // TODO
      return;
    }

    if (config === undefined) {
      throwError(`Couldn't find a Boostr configuration file`);
    }

    await install({directory, config});
  }
} as Command;

export async function install({directory, config}: {directory: string; config: any}) {
  await runNPMInstall(directory);

  if (config.type === 'application') {
    for (const serviceDirectoryRelative of Object.values<string>(config.services)) {
      const serviceDirectory = resolve(directory, serviceDirectoryRelative);
      await runNPMInstall(serviceDirectory);
    }
  }
}

async function runNPMInstall(directory: string) {
  const packageFile = join(directory, 'package.json');

  if (!existsSync(packageFile)) {
    return;
  }

  await runNPM({directory, arguments: ['install']});
}
