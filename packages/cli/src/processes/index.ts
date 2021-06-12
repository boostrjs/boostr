import {fork, ChildProcess} from 'child_process';
import readline from 'readline';

import {logMessage, logError} from '../utilities.js';

export class ProcessController {
  _name: string;
  _arguments: string[];
  _currentDirectory: string | undefined;
  _environment: any;
  _serviceName: string | undefined;
  _nodeArguments: string[];
  _decorateOutput: boolean;

  constructor(
    name: string,
    args: string[] = [],
    {
      currentDirectory,
      environment,
      serviceName,
      nodeArguments = [],
      decorateOutput = true
    }: {
      currentDirectory?: string;
      environment?: any;
      serviceName?: string;
      nodeArguments?: string[];
      decorateOutput?: boolean;
    } = {}
  ) {
    this._name = name;
    this._arguments = args;
    this._currentDirectory = currentDirectory;
    this._environment = environment;
    this._serviceName = serviceName;
    this._nodeArguments = nodeArguments;
    this._decorateOutput = decorateOutput;
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
      execArgv: [...process.execArgv, ...this._nodeArguments],
      stdio: this._decorateOutput ? 'pipe' : 'inherit'
    });

    let stdout: readline.Interface;
    let stderr: readline.Interface;

    if (this._decorateOutput) {
      stdout = readline.createInterface({input: this._childProcess.stdout!});

      stdout.on('line', (line) => {
        logMessage(line, {serviceName: this._serviceName});
      });

      stderr = readline.createInterface({input: this._childProcess.stderr!});

      stderr.on('line', (line) => {
        logError(line, {serviceName: this._serviceName});
      });
    }

    const messageHandler = (message: string) => {
      if (message === 'started') {
        if (onStarted !== undefined) {
          const _onStarted = onStarted;
          onStarted = undefined;
          _onStarted();
        }
      }
    };

    const rootProcessExitHandler = (code: number) => {
      if (code !== 0) {
        this._childProcess?.kill();
      }
    };

    const exitHandler = (code: number | null) => {
      if (stdout !== undefined) {
        stdout.close();
      }

      if (stderr !== undefined) {
        stderr.close();
      }

      this._childProcess?.off('message', messageHandler);
      this._childProcess?.off('exit', exitHandler);
      this._childProcess = undefined;

      process.off('exit', rootProcessExitHandler);

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

    process.on('exit', rootProcessExitHandler);
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
