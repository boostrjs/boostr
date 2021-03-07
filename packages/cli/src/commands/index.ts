import mri from 'mri';

import main from './main.js';
import init from './init.js';
import npm from './npm.js';
import {throwError} from '../util.js';

const COMMANDS = [main, init, npm];
const BUILT_IN_STAGES = ['development', 'staging', 'production'];

export type Command = {
  name: string;
  minimumArguments?: number;
  maximumArguments?: number;
  useRawArguments?: boolean;
  options?: {
    [name: string]: {
      aliases?: string[];
    };
  };
  handler: (
    commandArguments: readonly string[],
    commandOptions: any,
    {
      directory,
      config,
      componentName
    }: {directory: string; config: any; componentName: string | undefined}
  ) => Promise<void>;
};

export function getCommand(
  rawArguments: string[],
  {componentNames = []}: {componentNames?: string[]} = {}
) {
  let componentName: string | undefined;
  let commandName: string;

  if (
    rawArguments.length > 0 &&
    !rawArguments[0].startsWith('-') &&
    componentNames.includes(rawArguments[0])
  ) {
    componentName = rawArguments[0];
    rawArguments = rawArguments.slice(1);
  }

  if (rawArguments.length > 0 && !rawArguments[0].startsWith('-')) {
    commandName = rawArguments[0];
    rawArguments = rawArguments.slice(1);
  } else {
    commandName = main.name;
  }

  const command = COMMANDS.find((command) => command.name === commandName);

  if (command === undefined) {
    throwError(`The specified command is unknown: ${commandName}`);
  }

  let globalOptions: any;
  let commandArguments: readonly string[];
  let commandOptions: any;

  const {
    minimumArguments = 0,
    maximumArguments = 0,
    useRawArguments = false,
    options: availableCommandOptions = {},
    handler: commandHandler
  } = command;

  if (useRawArguments) {
    commandArguments = [...rawArguments];
  } else {
    let {_: parsedArguments, ...parsedOptions} = mri(rawArguments);

    if (parsedArguments.length < minimumArguments) {
      throwError(`A required argument is missing`);
    }

    if (parsedArguments.length > maximumArguments) {
      throwError(`The specified argument is unexpected: ${parsedArguments[maximumArguments]}`);
    }

    commandArguments = parsedArguments;
    globalOptions = pullGlobalOptions(parsedOptions);
    commandOptions = getCommandOptions(parsedOptions, availableCommandOptions);
  }

  return {componentName, globalOptions, commandHandler, commandArguments, commandOptions};
}

function pullGlobalOptions(parsedOptions: any) {
  const globalOptions: any = {};

  if (parsedOptions.stage !== undefined) {
    if (typeof parsedOptions.stage !== 'string') {
      throwError(`The value of the --stage option should be a string`);
    }

    globalOptions.stage = parsedOptions.stage;
    delete parsedOptions.stage;
  }

  for (const stage of BUILT_IN_STAGES) {
    if (parsedOptions[stage]) {
      globalOptions.stage = stage;
      delete parsedOptions[stage];
    }
  }

  return globalOptions;
}

function getCommandOptions(
  parsedOptions: any,
  availableCommandOptions: NonNullable<Command['options']>
) {
  const commandOptions: any = {};

  for (const [parsedName, value] of Object.entries(parsedOptions)) {
    let actualName: string | undefined;

    for (const [name, {aliases = []}] of Object.entries(availableCommandOptions)) {
      if (parsedName === name || aliases.includes(parsedName)) {
        actualName = name;
        break;
      }
    }

    if (actualName === undefined) {
      const formattedName = parsedName.length === 1 ? `-${parsedName}` : `--${parsedName}`;
      throwError(`The specified option is unknown: ${formattedName}`);
    }

    commandOptions[actualName] = value;
  }

  return commandOptions;
}
