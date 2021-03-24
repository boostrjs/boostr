import {existsSync, readFileSync} from 'fs';
import fsExtra from 'fs-extra';
import {join, sep} from 'path';
import {homedir} from 'os';
import {execFileSync} from 'child_process';
import {createRequire} from 'module';
import memoize from 'lodash/memoize.js';

import {logMessage, throwError} from './util.js';

export function loadNPMPackage(directory: string) {
  const packageFile = join(directory, 'package.json');

  if (!existsSync(packageFile)) {
    throwError(`Couldn't find a 'package.json' file in the following directory: ${directory}`);
  }

  const json = readFileSync(packageFile, 'utf-8');

  let pkg: any;

  try {
    pkg = JSON.parse(json);
  } catch {
    throwError(`An error occurred while parsing the following file: ${packageFile}`);
  }

  return pkg;
}

export async function runNPM({
  directory,
  arguments: args
}: {
  directory: string;
  arguments: string[];
}) {
  try {
    execFileSync('npm', args, {cwd: directory, stdio: 'inherit'});
  } catch {
    console.log();
    throwError(`An error occurred while executing npm`);
  }
}

export async function runNPMInstallIfThereIsAPackage(directory: string) {
  const packageFile = join(directory, 'package.json');

  if (!existsSync(packageFile)) {
    return;
  }

  await runNPM({directory, arguments: ['install']});
}

export async function runNPMUpdateIfThereIsAPackage(directory: string) {
  const packageFile = join(directory, 'package.json');

  if (!existsSync(packageFile)) {
    return;
  }

  await runNPM({directory, arguments: ['update']});
}

const memoizedCreateRequire = memoize(createRequire);

// A way to lazily install npm packages while turning around an issue where packages
// containing binary (e.g. esbuild) cannot be installed with `npm --global`
export async function requireGlobalPackage(
  packageName: string,
  packageVersion: string,
  {serviceName}: {serviceName?: string} = {}
) {
  const packageDirectory = join(
    homedir(),
    '.cache',
    'boostr',
    'dependencies',
    packageName,
    packageVersion
  );

  if (!existsSync(packageDirectory)) {
    logMessage(`Installing '${packageName}@${packageVersion}'...`, {serviceName});

    try {
      fsExtra.outputJsonSync(join(packageDirectory, 'package.json'), {
        name: 'unknown',
        description: 'unknown',
        license: 'MIT',
        repository: 'unknown',
        dependencies: {
          [packageName]: packageVersion
        }
      });

      await runNPM({directory: packageDirectory, arguments: ['install']});
    } catch (error) {
      fsExtra.removeSync(packageDirectory);

      throw error;
    }
  }

  const require = memoizedCreateRequire(packageDirectory + sep);

  return require(packageName);
}
