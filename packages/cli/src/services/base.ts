import {Command, getCommandOptions} from '../command.js';
import {runNPMInstallIfThereIsAPackage, runNPMUpdateIfThereIsAPackage} from '../npm.js';
import {parseRawArguments, pullGlobalOptions} from '../argument-parser.js';
import {runNPM} from '../npm.js';
import {logMessage, logError, throwError} from '../util.js';

export type BaseServiceAttributes = {
  directory: string;
  config: any;
  stage: string;
};

export class BaseService {
  ['constructor']!: typeof BaseService;

  static type: string;

  static help: string;

  static isRoot: boolean;

  constructor({directory, config, stage}: BaseServiceAttributes) {
    this._directory = directory;
    this._config = config;
    this._stage = stage;
  }

  _directory!: string;

  getDirectory() {
    return this._directory;
  }

  _config: any;

  getConfig() {
    return this._config;
  }

  _stage!: string;

  getStage() {
    return this._stage;
  }

  // === Utilities ===

  logMessage(message: string) {
    logMessage(message);
  }

  logError(message: string) {
    logError(message);
  }

  throwError(message: string): never {
    throwError(message);
  }

  // === Commands ===

  static commands: Record<string, Command> = {
    install: {
      async handler(this: BaseService) {
        await this.install();
      },
      help: 'Install help...'
    },

    update: {
      async handler(this: BaseService) {
        await this.update();
      },
      help: 'Update help...'
    },

    build: {
      async handler(this: BaseService) {
        await this.build();
      },
      help: 'Build help...'
    },

    start: {
      async handler(this: BaseService) {
        await this.start();
      },
      help: 'Start help...'
    },

    migrate: {
      async handler(this: BaseService) {
        await this.migrate();
      },
      help: 'Migrate help...'
    },

    deploy: {
      async handler(this: BaseService) {
        await this.deploy();
      },
      help: 'Deploy help...'
    },

    config: {
      async handler(this: BaseService) {
        await this.showConfig();
      },
      help: 'Config help...'
    },

    npm: {
      useRawArguments: true,
      async handler(this: BaseService, args) {
        await this.runNPM(args);
      },
      help: 'NPM help...'
    }
  };

  getCommand(name: string) {
    for (const [commandName, command] of Object.entries(this.constructor.commands)) {
      if (commandName === name || command.aliases?.includes(name)) {
        return command;
      }
    }

    if (this.constructor.isRoot) {
      this.throwError(`The specified service or command is unknown: ${name}`);
    } else {
      this.throwError(`The specified command is unknown: ${name}`);
    }
  }

  async runCommand(
    name: string,
    rawArguments: string[],
    {showHelp = false}: {showHelp?: boolean} = {}
  ) {
    const {
      minimumArguments = 0,
      maximumArguments = 0,
      useRawArguments = false,
      options: availableCommandOptions = {},
      handler: commandHandler,
      help: commandHelp
    } = this.getCommand(name);

    if (showHelp) {
      console.log(commandHelp);
      return;
    }

    let commandArguments: string[];
    let commandOptions: Record<string, any>;

    if (useRawArguments) {
      commandArguments = [...rawArguments];
      commandOptions = {};
    } else {
      let {parsedArguments, parsedOptions} = parseRawArguments(rawArguments);

      if (parsedArguments.length < minimumArguments) {
        throwError(`A required argument is missing`);
      }

      if (parsedArguments.length > maximumArguments) {
        throwError(`A specified argument is unexpected: ${parsedArguments[maximumArguments]}`);
      }

      commandArguments = parsedArguments;
      pullGlobalOptions(parsedOptions);
      commandOptions = getCommandOptions(parsedOptions, availableCommandOptions);
    }

    await commandHandler.call(this, commandArguments, commandOptions);
  }

  async install() {
    await runNPMInstallIfThereIsAPackage(this.getDirectory());
  }

  async update() {
    await runNPMUpdateIfThereIsAPackage(this.getDirectory());
  }

  async build(..._: any[]): Promise<any> {}

  _hasBeenStarted = false;

  async start() {
    this._hasBeenStarted = true;
  }

  async migrate() {}

  _hasBeenDeployed = false;

  async deploy() {
    this._hasBeenDeployed = true;
  }

  async showConfig() {
    console.log(JSON.stringify(this.getConfig(), undefined, 2));
  }

  async runNPM(args: string[]) {
    await runNPM({directory: this.getDirectory(), arguments: args});
  }
}
