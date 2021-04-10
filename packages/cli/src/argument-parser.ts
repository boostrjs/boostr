import mri from 'mri';

import {throwError} from './util.js';

export const GLOBAL_OPTIONS_HELP_OBJECT = {
  '--stage': "Select a stage (default: 'development').",
  '--development': 'A shorthand for `--stage=development`.',
  '--staging': 'A shorthand for `--stage=staging`.',
  '--production': 'A shorthand for `--stage=production`.',
  '--version, -v': 'Show the current version.',
  '--help, -h': 'Show this screen.'
};

const BUILT_IN_STAGES = ['development', 'staging', 'production'];

export function parseRawArguments(rawArguments: string[]) {
  const {_: parsedArguments, ...parsedOptions} = mri(rawArguments);

  return {parsedArguments, parsedOptions} as {
    parsedArguments: string[];
    parsedOptions: Record<string, any>;
  };
}

export function pullGlobalOptions(parsedOptions: Record<string, any>) {
  const globalOptions: Record<string, any> = {};

  if (parsedOptions.help || parsedOptions.h) {
    globalOptions.showHelp = true;
    delete parsedOptions.help;
    delete parsedOptions.h;
  }

  if (parsedOptions.version || parsedOptions.v) {
    globalOptions.showVersion = true;
    delete parsedOptions.version;
    delete parsedOptions.v;
  }

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
