import type {Command} from './index.js';
import {programVersion} from '../util.js';

export default {
  name: '$main',
  options: {
    version: {
      aliases: ['v']
    },
    help: {
      aliases: ['h']
    }
  },
  async handler([], {version}: {version: boolean}) {
    if (version) {
      console.log(`v${programVersion}`);
      return;
    }

    console.log('Main help...'); // TODO
  }
} as Command;
