import {throwError} from './utilities.js';

export type Command = {
  aliases?: string[];
  description?: string;
  examples?: string[];
  minimumArguments?: number;
  maximumArguments?: number;
  useRawArguments?: boolean;
  options?: Record<
    string,
    {
      type?: string;
      aliases?: string[];
      description?: string;
    }
  >;
  handler?: (commandArguments: string[], commandOptions: Record<string, any>) => Promise<void>;
};

export function getCommandOptions(
  parsedOptions: Record<string, any>,
  availableCommandOptions: NonNullable<Command['options']>
) {
  const commandOptions: Record<string, any> = {};

  for (let [parsedName, value] of Object.entries(parsedOptions)) {
    let actualName: string | undefined;

    const formattedName = formatCommandOptionName(parsedName);

    for (const [name, {type, aliases = []}] of Object.entries(availableCommandOptions)) {
      if (parsedName === name || aliases.includes(parsedName)) {
        if (type === 'string' && typeof value !== 'string') {
          throwError(`A string value should be specified for the ${formattedName} option`);
        }

        if (type === 'string[]') {
          if (!Array.isArray(value)) {
            value = [value];
          }

          for (const item of value) {
            if (typeof item !== 'string') {
              throwError(`A string value should be specified for the ${formattedName} option`);
            }
          }
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

export function formatCommandOptionName(name: string) {
  return name.length === 1 ? `-${name}` : `--${name}`;
}
