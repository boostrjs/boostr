import type {Command} from './index.js';

export default {
  name: 'init',
  options: {
    help: {
      aliases: ['h']
    }
  },
  async handler([], {help}: {help: boolean}, {config}) {
    if (help) {
      console.log('Init help...'); // TODO
      return;
    }

    console.log('Initializing...');
    console.log(config);
  }
} as Command;
