import process from 'process';

import {getCommand} from './commands/index.js';
import {loadRootConfigFile} from './config.js';

export async function runCLI(
  args: string[],
  {currentDirectory = process.cwd()}: {currentDirectory?: string} = {}
) {
  let componentNames: string[] | undefined;

  const config = await loadRootConfigFile(currentDirectory);

  if (config?.components !== undefined) {
    componentNames = Object.keys(config.components);
  }

  const {commandHandler, commandArguments, commandOptions, componentName} = getCommand(args, {
    componentNames
  });

  await commandHandler(commandArguments, commandOptions, {componentName});
}
