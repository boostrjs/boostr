import mri from 'mri';

import main from './main.js';
import init from './init.js';
import {throwError} from '../util.js';

export type Command = {
  name: string;
  options?: {
    [name: string]: {
      aliases?: string[];
    };
  };
  handler: (
    commandArguments: readonly string[],
    commandOptions: any,
    {componentName}: {componentName: string | undefined}
  ) => Promise<void>;
};

const commands = [main, init];

export function getCommand(
  args: string[],
  {componentNames = []}: {componentNames?: string[]} = {}
) {
  let componentName: string | undefined;
  let commandName: string;

  let {_: commandArguments, ...rawCommandOptions} = mri(args);

  const componentNameOrCommandName = commandArguments[0];

  if (
    componentNameOrCommandName !== undefined &&
    componentNames.includes(componentNameOrCommandName)
  ) {
    componentName = componentNameOrCommandName;
    commandArguments = commandArguments.slice(1);
  }

  if (commandArguments.length > 0) {
    commandName = commandArguments[0];
    commandArguments = commandArguments.slice(1);
  } else {
    commandName = main.name;
  }

  const command = commands.find((command) => command.name === commandName);

  if (command === undefined) {
    throwError(`Unknown command: ${commandName}`);
  }

  const {options: availableCommandOptions = {}, handler: commandHandler} = command;

  let commandOptions: any = {};

  for (const [rawName, value] of Object.entries(rawCommandOptions)) {
    let actualName: string | undefined;

    for (const [name, {aliases = []}] of Object.entries(availableCommandOptions)) {
      if (rawName === name || aliases.includes(rawName)) {
        actualName = name;
        break;
      }
    }

    if (actualName === undefined) {
      const formattedName = rawName.length === 1 ? `-${rawName}` : `--${rawName}`;
      throwError(`Unknown option: ${formattedName}`);
    }

    commandOptions[actualName] = value;
  }

  return {commandHandler, commandArguments, commandOptions, componentName};
}
