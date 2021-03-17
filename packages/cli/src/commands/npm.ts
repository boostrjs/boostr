import type {Command} from './index.js';

import {runNPM} from '../npm.js';

export default {
  name: 'npm',
  useRawArguments: true,
  async handler(args, _, {directory}) {
    await runNPM({directory, arguments: args});
  }
} as Command;
