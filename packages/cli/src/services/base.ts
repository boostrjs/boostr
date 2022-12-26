import {execFileSync} from 'child_process';
import isEmpty from 'lodash/isEmpty.js';

import {Command, getCommandOptions, formatCommandOptionName} from '../command.js';
import {
  runNPMInstallIfThereIsAPackage,
  runNPMUpdateIfThereIsAPackage,
  runNPMTestIfThereIsAPackage
} from '../npm.js';
import {
  parseRawArguments,
  pullGlobalOptions,
  GLOBAL_OPTIONS_HELP_OBJECT
} from '../argument-parser.js';
import {formatHelp, Sections} from '../help.js';
import {logMessage, logError, throwError} from '../utilities.js';

export type BaseServiceAttributes = {
  directory: string;
  config: any;
  stage: string;
};

export abstract class BaseService {
  ['constructor']!: typeof BaseService;

  static type: string;

  static description: string;

  static examples: string[];

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

  abstract getName(): string;

  // === Help ===

  generateHelp() {
    const sections: Sections = {};

    sections['Service'] = `${this.getName()} (${this.constructor.type})`;

    sections['Description'] = this.constructor.description;

    sections['Usage'] = `boostr ${
      this.constructor.isRoot ? '[<service>]' : this.getName()
    } <command> [options]`;

    sections['Commands'] = {};

    for (const [name, {aliases = [], description}] of Object.entries(this.constructor.commands)) {
      if (description !== undefined) {
        const nameWithAliases = [name, ...aliases].join(', ');
        sections['Commands'][nameWithAliases] = description;
      }
    }

    sections['Global Options'] = GLOBAL_OPTIONS_HELP_OBJECT;

    if (this.constructor.examples?.length > 0) {
      sections['Examples'] = this.constructor.examples;
    }

    sections['Learn more about a specific command'] = `boostr${
      !this.constructor.isRoot ? ' ' + this.getName() : ''
    } <command> --help`;

    if (this.constructor.isRoot) {
      sections['Learn more about a specific service'] = `boostr <service> --help`;
    }

    return formatHelp(sections, {variables: {serviceName: this.getName()}});
  }

  // === Utilities ===

  logMessage(message: string) {
    logMessage(message, {serviceName: this.getName()});
  }

  logError(message: string) {
    logError(message, {serviceName: this.getName()});
  }

  throwError(message: string): never {
    throwError(message, {serviceName: this.getName()});
  }

  // === Commands ===

  static commands: Record<string, Command> = {
    install: {
      async handler(this: BaseService) {
        await this.install();
      }
    },

    update: {
      async handler(this: BaseService) {
        await this.update();
      }
    },

    check: {
      description: 'Checks your TypeScript code.',
      async handler(this: BaseService) {
        await this.check();
      }
    },

    build: {
      description: 'Builds runnable artifacts from your source code.',
      async handler(this: BaseService) {
        await this.build();
      }
    },

    test: {
      async handler(this: BaseService) {
        await this.test();
      }
    },

    start: {
      async handler(this: BaseService) {
        await this.start();
      }
    },

    introspect: {},

    eval: {},

    repl: {},

    freeze: {},

    migrate: {},

    import: {},

    export: {},

    deploy: {
      options: {
        skip: {
          type: 'string[]',
          description: 'Skips a specific service when deploying.'
        }
      },
      async handler(this: BaseService, [], {skip: skipServiceNames = []}: {skip?: string[]}) {
        await this.deploy({skipServiceNames});
      }
    },

    config: {
      async handler(this: BaseService) {
        await this.showConfig();
      }
    },

    exec: {
      useBareDoubleDash: true,
      async handler(this: BaseService, args) {
        await this.execute(args);
      }
    }
  };

  getCommand(nameOrAlias: string) {
    for (const [name, command] of Object.entries(this.constructor.commands)) {
      if (
        (name === nameOrAlias || command.aliases?.includes(nameOrAlias)) &&
        command.handler !== undefined &&
        command.description !== undefined
      ) {
        return {
          ...command,
          name,
          handler: command.handler,
          description: command.description
        };
      }
    }

    if (this.constructor.isRoot) {
      this.throwError(`The specified service or command is unknown: ${nameOrAlias}`);
    } else {
      this.throwError(`The specified command is unknown: ${nameOrAlias}`);
    }
  }

  async runCommand(
    nameOrAlias: string,
    rawArguments: string[],
    {showHelp = false}: {showHelp?: boolean} = {}
  ) {
    if (showHelp) {
      console.log(this.generateCommandHelp(nameOrAlias));
      return;
    }

    const {
      arguments: arguments_ = [],
      options: availableCommandOptions = {},
      useBareDoubleDash = false,
      handler: commandHandler
    } = this.getCommand(nameOrAlias);

    let {parsedArguments, parsedOptions} = parseRawArguments(rawArguments);

    if (!useBareDoubleDash) {
      if (parsedArguments.length < arguments_.length) {
        throwError(`A required argument is missing: ${arguments_[parsedArguments.length]}`);
      }

      if (parsedArguments.length > arguments_.length) {
        throwError(`A specified argument is unexpected: ${parsedArguments[arguments_.length]}`);
      }
    }

    const commandArguments = parsedArguments;

    pullGlobalOptions(parsedOptions);

    const commandOptions = getCommandOptions(parsedOptions, availableCommandOptions);

    await commandHandler.call(this, commandArguments, commandOptions);
  }

  generateCommandHelp(nameOrAlias: string) {
    const {
      name,
      aliases = [],
      description,
      examples = [],
      arguments: arguments_ = [],
      options = {},
      useBareDoubleDash = false
    } = this.getCommand(nameOrAlias);

    const sections: Sections = {};

    sections['Command'] = name;

    if (aliases.length > 0) {
      sections[aliases.length === 1 ? 'Alias' : 'Aliases'] = aliases.join(', ');
    }

    sections['Description'] = description;

    sections['Usage'] = `boostr ${
      this.constructor.isRoot ? '[<service>]' : this.getName()
    } ${nameOrAlias}`;

    for (const argument of arguments_) {
      sections['Usage'] += ` <${argument}>`;
    }

    sections['Usage'] += ' [options]';

    if (useBareDoubleDash) {
      sections['Usage'] += ' -- <command> ...';
    }

    const optionsHelp: Record<string, string> = {};

    for (const [name, {aliases = [], description}] of Object.entries(options)) {
      if (description !== undefined) {
        const formattedNameWithAliases = [name, ...aliases]
          .map((name) => formatCommandOptionName(name))
          .join(', ');
        optionsHelp[formattedNameWithAliases] = description;
      }
    }

    if (!isEmpty(optionsHelp)) {
      sections['Command Options'] = optionsHelp;
    }

    sections['Global Options'] = GLOBAL_OPTIONS_HELP_OBJECT;

    if (examples.length > 0) {
      sections[examples.length === 1 ? 'Example' : 'Examples'] = examples;
    }

    return formatHelp(sections, {variables: {serviceName: this.getName()}});
  }

  async install() {
    await runNPMInstallIfThereIsAPackage(this.getDirectory(), {serviceName: this.getName()});
  }

  async update() {
    await runNPMUpdateIfThereIsAPackage(this.getDirectory(), {serviceName: this.getName()});
  }

  async check(..._: any[]): Promise<any> {}

  async build(..._: any[]): Promise<any> {}

  async test() {
    const {environment} = this.getConfig();

    await runNPMTestIfThereIsAPackage(this.getDirectory(), {
      serviceName: this.getName(),
      beforeTest: async () => {
        await this.build();
      },
      environment: {...process.env, ...environment}
    });
  }

  _hasBeenStarted = false;

  async start() {
    this._hasBeenStarted = true;
  }

  _hasBeenStopped = false;

  async stop() {
    this._hasBeenStopped = true;
  }

  _hasBeenDeployed = false;

  async deploy({skipServiceNames: _ = []}: {skipServiceNames?: string[]} = {}) {
    if (this.getConfig().platform === 'local') {
      this.throwError(`Please specify a non-local stage (example: \`boostr deploy --production\`)`);
    }

    this._hasBeenDeployed = true;
  }

  async showConfig() {
    console.log(JSON.stringify(this.getConfig(), undefined, 2));
  }

  async execute(commandAndArguments: string[]) {
    const [command, ...args] = commandAndArguments;

    if (command === undefined) {
      this.throwError(`Please specify a shell command to execute`);
    }

    const {environment} = this.getConfig();

    try {
      execFileSync(command, args, {
        cwd: this.getDirectory(),
        env: {...process.env, ...environment},
        stdio: 'inherit'
      });
    } catch (error) {
      console.log();
      throwError(`An error occurred while executing the specified command`);
    }
  }
}
