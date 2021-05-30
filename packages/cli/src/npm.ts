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

export async function installNPMPackages(directory: string, packages: Record<string, string>) {
  const generatedPackageFile = join(directory, 'package.json');

  fsExtra.outputJSONSync(generatedPackageFile, {
    private: true,
    dependencies: packages
  });

  try {
    await runNPM(directory, ['install'], {silent: true});
  } finally {
    fsExtra.removeSync(generatedPackageFile);
  }
}

export function findInstalledNPMPackage(directory: string, packageName: string) {
  const packageDirectory = join(directory, 'node_modules', ...packageName.split('/'));

  if (!existsSync(packageDirectory)) {
    return undefined;
  }

  return loadNPMPackage(packageDirectory);
}

export async function runNPM(
  directory: string,
  args: string[] = [],
  {silent = false}: {silent?: boolean} = {}
) {
  try {
    execFileSync('npm', args, {cwd: directory, stdio: silent ? 'pipe' : 'inherit'});
  } catch (error) {
    if (silent) {
      console.error(error.stderr.toString());
    } else {
      console.log();
    }
    throwError(`An error occurred while executing npm`);
  }
}

export async function runNPMInstallIfThereIsAPackage(
  directory: string,
  {serviceName}: {serviceName?: string} = {}
) {
  const packageFile = join(directory, 'package.json');

  if (!existsSync(packageFile)) {
    return;
  }

  logMessage('Installing npm dependencies...', {serviceName});

  await runNPM(directory, ['install']);
}

export async function runNPMUpdateIfThereIsAPackage(
  directory: string,
  {serviceName}: {serviceName?: string} = {}
) {
  const packageFile = join(directory, 'package.json');

  if (!existsSync(packageFile)) {
    return;
  }

  logMessage('Updating npm dependencies...', {serviceName});

  await runNPM(directory, ['update']);
}

// A way to lazily install npm packages while turning around an issue where packages
// containing binary (e.g. esbuild) cannot be installed with `npm --global`
export async function installGlobalNPMPackage(
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
        private: true,
        dependencies: {
          [packageName]: packageVersion
        }
      });

      await runNPM(packageDirectory, ['install']);
    } catch (error) {
      fsExtra.removeSync(packageDirectory);

      throw error;
    }
  }

  return packageDirectory;
}

const memoizedCreateRequire = memoize(createRequire);

export async function requireGlobalNPMPackage(
  packageName: string,
  packageVersion: string,
  {serviceName}: {serviceName?: string} = {}
) {
  const packageDirectory = await installGlobalNPMPackage(packageName, packageVersion, {
    serviceName
  });

  const require = memoizedCreateRequire(packageDirectory + sep);

  return require(packageName);
}

export function resolveInternalNPMPackage(packageName: string) {
  const require = memoizedCreateRequire(import.meta.url.toString());

  return require.resolve(packageName);
}
