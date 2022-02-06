import {createApplicationServiceFromDirectory} from './services/index.js';
import {BaseService} from './services/base.js';
import {initialize} from './initialize.js';
import {
  parseRawArguments,
  pullGlobalOptions,
  GLOBAL_OPTIONS_HELP_OBJECT
} from './argument-parser.js';
import {formatHelp} from './help.js';
import {programVersion, throwError} from './utilities.js';

const DEFAULT_STAGE = process.env.BOOSTR_STAGE || 'development';

const CONFIG_NOT_FOUND_HELP = `
Couldn't find a configuration file.
${formatHelp({
  'Run the following command to initialize your project': 'boostr initialize --template=<package>',

  'Find out more about the `initialize` command by running': 'boostr initialize --help',

  'Options': GLOBAL_OPTIONS_HELP_OBJECT
})}`;

export async function runCLI(
  rawArguments: string[],
  {currentDirectory = process.cwd()}: {currentDirectory?: string} = {}
) {
  let {parsedOptions} = parseRawArguments(rawArguments);

  const {stage = DEFAULT_STAGE, showHelp = false, showVersion = false} = pullGlobalOptions(
    parsedOptions
  );

  if (showVersion) {
    console.log(`v${programVersion}`);
    return;
  }

  const applicationService = await createApplicationServiceFromDirectory(currentDirectory, {stage});

  let currentService: BaseService | undefined = applicationService;

  if (rawArguments.length > 0 && applicationService?.hasService(rawArguments[0])) {
    currentService = applicationService.getService(rawArguments[0]);
    rawArguments = rawArguments.slice(1);
  }

  let commandName: string | undefined;

  if (rawArguments.length > 0 && !rawArguments[0].startsWith('-')) {
    commandName = rawArguments[0];
    rawArguments = rawArguments.slice(1);
  }

  if (commandName === undefined) {
    if (currentService !== undefined) {
      console.log(currentService.generateHelp());
    } else {
      console.log(CONFIG_NOT_FOUND_HELP);
    }
    return;
  }

  if (commandName === 'initialize' || commandName === 'init') {
    if (applicationService !== undefined) {
      throwError(
        `Sorry, but it seems that this project has already been initialized (a configuration file was found in ${applicationService.getDirectory()})`
      );
    }

    await initialize(currentDirectory, parsedOptions, {stage, showHelp});
    return;
  }

  if (currentService === undefined) {
    throwError("Couldn't find a configuration file");
  }

  await currentService.runCommand(commandName, rawArguments, {showHelp});
}
