import {existsSync} from 'fs';
import {join} from 'path';
import {execFileSync} from 'child_process';

import {installGlobalNPMPackage} from './npm.js';
import {logMessage, throwError} from './utilities.js';

const TYPESCRIPT_PACKAGE_VERSION = '4.8.4';

export async function check({
  serviceDirectory,
  serviceName
}: {
  serviceDirectory: string;
  serviceName?: string;
}) {
  const tsConfigFile = join(serviceDirectory, 'tsconfig.json');

  if (!existsSync(tsConfigFile)) {
    return; // Nothing to do if there is no 'tsconfig.json' file
  }

  logMessage('Checking your TypeScript code...', {serviceName});

  const typeScriptPackageDirectory = await installGlobalNPMPackage(
    'typescript',
    TYPESCRIPT_PACKAGE_VERSION,
    {serviceName}
  );

  const tscFile = join(typeScriptPackageDirectory, 'node_modules', 'typescript', 'bin', 'tsc');

  if (!existsSync(tscFile)) {
    throwError(`Couldn't find the TypeScript compiler (expected location: '${tscFile}')`, {
      serviceName
    });
  }

  try {
    execFileSync(tscFile, ['--noEmit'], {cwd: serviceDirectory, stdio: 'inherit'});
  } catch (error) {
    throwError('Check failed', {serviceName});
  }
}
