import {createApplicationServiceFromDirectory} from './services/index.js';
import {BaseService} from './services/base.js';
import {initialize} from './initialize.js';
import {parseRawArguments, pullGlobalOptions} from './argument-parser.js';
import {programVersion, throwError} from './util.js';

const DEFAULT_STAGE = 'development';

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
      console.log(currentService.constructor.help);
    } else {
      console.log('General help...');
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
