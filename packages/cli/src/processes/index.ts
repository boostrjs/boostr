import {fork, ChildProcess} from 'child_process';
import readline from 'readline';

import {logMessage, logError} from '../util.js';

export class ProcessController {
  _name!: string;
  _arguments!: string[];
  _currentDirectory?: string;
  _environment?: any;
  _serviceName?: string;

  constructor(
    name: string,
    args: string[] = [],
    {
      currentDirectory,
      environment,
      serviceName
    }: {
      currentDirectory?: string;
      environment?: any;
      serviceName?: string;
    } = {}
  ) {
    this._name = name;
    this._arguments = args;
    this._currentDirectory = currentDirectory;
    this._environment = environment;
    this._serviceName = serviceName;
  }

  start() {
    return new Promise<void>((resolve) => {
      this._start({onStarted: resolve});
    });
  }

  _childProcess: ChildProcess | undefined;

  _start({onStarted, onExited}: {onStarted?: () => void; onExited?: () => void} = {}) {
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
      logMessage(line, {serviceName: this._serviceName});
    });

    const stderr = readline.createInterface({input: this._childProcess.stderr!});

    stderr.on('line', (line) => {
      logError(line, {serviceName: this._serviceName});
    });

    const messageHandler = (message: string) => {
      if (message === 'started') {
        if (onStarted !== undefined) {
          const _onStarted = onStarted;
          onStarted = undefined;
          _onStarted();
        }
      }
    };

    const exitHandler = (code: number | null) => {
      stdout.close();
      stderr.close();
      this._childProcess?.off('message', messageHandler);
      this._childProcess?.off('exit', exitHandler);
      this._childProcess = undefined;

      if (onExited !== undefined) {
        const _onExited = onExited;
        onExited = undefined;
        _onExited();
        return;
      }

      if (code !== null) {
        logMessage('Waiting 10 seconds before restarting...', {serviceName: this._serviceName});
        setTimeout(() => this._start({onStarted}), 10 * 1000);
      } else {
        this._start({onStarted});
      }
    };

    this._childProcess.on('message', messageHandler);
    this._childProcess.on('exit', exitHandler);
  }

  restart() {
    if (this._childProcess === undefined) {
      return;
    }

    this._childProcess.kill();
  }

  run() {
    return new Promise<void>((resolve) => {
      this._start({onExited: resolve});
    });
  }
}
