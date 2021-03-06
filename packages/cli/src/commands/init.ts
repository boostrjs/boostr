import type {Command} from './index.js';

export default {
  name: 'init',
  options: {
    help: {
      aliases: ['h']
    }
  },
  async handler([], {help}: {help: boolean}) {
    if (help) {
      console.log('Init help...'); // TODO
      return;
    }

    console.log('Initializing...');
  }
} as Command;
