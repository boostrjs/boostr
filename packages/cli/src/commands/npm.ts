import {execFileSync} from 'child_process';

import type {Command} from './index.js';

export default {
  name: 'npm',
  useRawArguments: true,
  options: {
    help: {
      aliases: ['h']
    }
  },
  async handler(args, _, {directory}) {
    try {
      execFileSync('npm', args, {cwd: directory, stdio: 'inherit'});
    } catch (error) {
      process.exit(error.status);
    }
  }
} as Command;
