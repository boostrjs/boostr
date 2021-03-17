import {getCommand} from './commands/index.js';
import {loadRootConfig, loadServiceConfig} from './config.js';

export async function runCLI(
  args: string[],
  {currentDirectory = process.cwd()}: {currentDirectory?: string} = {}
) {
  let serviceNames: string[] | undefined;

  let config = await loadRootConfig(currentDirectory);

  if (config?.services !== undefined) {
    serviceNames = Object.keys(config.services);
  }

  const {
    serviceName,
    globalOptions,
    commandHandler,
    commandArguments,
    commandOptions
  } = getCommand(args, {serviceNames});

  if (serviceName !== undefined) {
    config = await loadServiceConfig(config, serviceName, {stage: globalOptions?.stage});
  }

  const directory = config !== undefined ? config.__directory : currentDirectory;

  await commandHandler(commandArguments, commandOptions, {directory, config, serviceName});
}
