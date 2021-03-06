#!/usr/bin/env node

import {existsSync, readFileSync} from 'fs';
import {join} from 'path';

import {programName, logError} from './utilities.js';

async function main() {
  const entryPoint = findEntryPoint(process.cwd());

  const {runCLI} = await import(entryPoint);

  const args = process.argv.slice(2);

  await runCLI(args);
}

function findEntryPoint(directory: string) {
  if (process.env.BOOSTR_IGNORE_LOCAL_VERSION !== '1') {
    while (true) {
      const packageDirectory = join(directory, 'node_modules', programName);

      if (existsSync(packageDirectory)) {
        const packageFile = join(packageDirectory, 'package.json');

        if (existsSync(packageFile)) {
          const pkg = JSON.parse(readFileSync(packageFile, 'utf-8'));

          return join(packageDirectory, pkg.main);
        }
      }

      const parentDirectory = join(directory, '..');

      if (parentDirectory === directory) {
        break;
      }

      directory = parentDirectory;
    }
  }

  return './index.js';
}

main().catch((error: any) => {
  if (error?.displayMessage !== undefined) {
    logError(error.displayMessage, {serviceName: error?.serviceName});
  } else {
    console.error(error);
  }

  process.exit(1);
});
