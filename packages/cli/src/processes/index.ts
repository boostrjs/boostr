import {fork, ChildProcess} from 'child_process';
import readline from 'readline';

import {logMessage, logError} from '../util.js';

export class ProcessController {
  _name!: string;
  _arguments!: string[];
  _currentDirectory?: string;
  _environment?: any;
  _componentName?: string;

  constructor(
    name: string,
    args: string[] = [],
    {
      currentDirectory,
      environment,
      componentName
    }: {currentDirectory?: string; environment?: any; componentName?: string} = {}
  ) {
    this._name = name;
    this._arguments = args;
    this._currentDirectory = currentDirectory;
    this._environment = environment;
    this._componentName = componentName;
  }

  _childProcess: ChildProcess | undefined;

  start() {
    if (this._childProcess !== undefined) {
      return;
    }

    const url = new URL(`./${this._name}.js`, import.meta.url);

    this._childProcess = fork(url.pathname, this._arguments, {
      cwd: this._currentDirectory,
      env: {...process.env, ...this._environment},
      stdio: 'pipe'
    });

    const stdout = readline.createInterface({input: this._childProcess.stdout!});

    stdout.on('line', (line) => {
      logMessage(line, {componentName: this._componentName});
    });

    const stderr = readline.createInterface({input: this._childProcess.stderr!});

    stderr.on('line', (line) => {
      logError(line, {componentName: this._componentName});
    });

    this._childProcess.once('exit', (code) => {
      stdout.close();
      stderr.close();

      this._childProcess = undefined;

      if (code !== null) {
        logMessage('Waiting 10 seconds before restarting...', {componentName: this._componentName});
        setTimeout(() => this.start(), 10 * 1000);
      } else {
        this.start();
      }
    });
  }

  restart() {
    if (this._childProcess === undefined) {
      return;
    }

    this._childProcess.kill();
  }
}
