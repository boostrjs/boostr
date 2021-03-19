import {existsSync, readFileSync} from 'fs';
import {join} from 'path';
import {execFileSync} from 'child_process';

import {throwError} from './util.js';

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
  } catch (error) {
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
