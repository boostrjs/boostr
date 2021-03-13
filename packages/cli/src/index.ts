import {getCommand} from './commands/index.js';
import {loadRootConfig, loadComponentConfig} from './config.js';

export async function runCLI(
  args: string[],
  {currentDirectory = process.cwd()}: {currentDirectory?: string} = {}
) {
  let componentNames: string[] | undefined;

  let config = await loadRootConfig(currentDirectory);

  if (config?.components !== undefined) {
    componentNames = Object.keys(config.components);
  }

  const {
    componentName,
    globalOptions,
    commandHandler,
    commandArguments,
    commandOptions
  } = getCommand(args, {componentNames});

  if (componentName !== undefined) {
    config = await loadComponentConfig(config, componentName, {stage: globalOptions?.stage});
  }

  const directory = config !== undefined ? config.__directory : currentDirectory;

  await commandHandler(commandArguments, commandOptions, {directory, config, componentName});
}
