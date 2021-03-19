import {throwError} from './util.js';

export type Command = {
  aliases?: string[];
  minimumArguments?: number;
  maximumArguments?: number;
  useRawArguments?: boolean;
  options?: Record<
    string,
    {
      type?: string;
      aliases?: string[];
    }
  >;
  handler: (commandArguments: string[], commandOptions: Record<string, any>) => Promise<void>;
  help: string;
};

export function getCommandOptions(
  parsedOptions: Record<string, any>,
  availableCommandOptions: NonNullable<Command['options']>
) {
  const commandOptions: Record<string, any> = {};

  for (const [parsedName, value] of Object.entries(parsedOptions)) {
    let actualName: string | undefined;

    const formattedName = parsedName.length === 1 ? `-${parsedName}` : `--${parsedName}`;

    for (const [name, {type, aliases = []}] of Object.entries(availableCommandOptions)) {
      if (parsedName === name || aliases.includes(parsedName)) {
        if (type === 'string' && typeof value !== 'string') {
          throwError(`A string value should be specified for the ${formattedName} option`);
        }

        actualName = name;

        break;
      }
    }

    if (actualName === undefined) {
      throwError(`A specified option is unknown: ${formattedName}`);
    }

    commandOptions[actualName] = value;
  }

  return commandOptions;
}
