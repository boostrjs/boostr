import {execFileSync} from 'child_process';

import type {Command} from './index.js';

export default {
  name: 'npm',
  useRawArguments: true,
  async handler(args, _, {directory}) {
    await runNPM({directory, arguments: args});
  }
} as Command;

export async function runNPM({
  directory,
  arguments: args
}: {
  directory: string;
  arguments: readonly string[];
}) {
  try {
    execFileSync('npm', args, {cwd: directory, stdio: 'inherit'});
  } catch (error) {
    process.exit(error.status);
  }
}
