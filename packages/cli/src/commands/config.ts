import type {Command} from './index.js';
import {throwError} from '../util.js';

export default {
  name: 'config',
  options: {
    help: {
      aliases: ['h']
    }
  },
  async handler([], {help}: {help: boolean}, {config}) {
    if (help) {
      console.log('Config help...'); // TODO
      return;
    }

    if (config === undefined) {
      throwError(`Couldn't find a Boostr configuration file`);
    }

    await displayConfig({config});
  }
} as Command;

async function displayConfig({config}: {config: any}) {
  console.log(JSON.stringify(config, undefined, 2));
}
