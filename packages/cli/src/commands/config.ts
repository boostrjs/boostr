import type {Command} from './index.js';

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

    console.log(JSON.stringify(config, undefined, 2));
  }
} as Command;
