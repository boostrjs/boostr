import {existsSync} from 'fs';
import {join} from 'path';
import merge from 'lodash/merge.js';

import {throwError} from './util.js';

const CONFIG_FILE_NAME = 'boostr.config.js';
const PRIVATE_CONFIG_FILE_NAME = 'boostr.config.private.js';
const DEFAULT_STAGE = 'development';

export async function loadRootConfig(directory: string) {
  while (true) {
    const config = await loadConfig(directory);

    if (config !== undefined && config.type === 'application') {
      return config;
    }

    const parentDirectory = join(directory, '..');

    if (parentDirectory === directory) {
      break;
    }

    directory = parentDirectory;
  }

  return undefined;
}

export async function loadComponentConfig(
  rootConfig: any,
  componentName: string,
  {stage = DEFAULT_STAGE}: {stage?: string} = {}
) {
  const rootDirectory = rootConfig.__directory;
  const componentDirectoryRelative = rootConfig?.components?.[componentName];

  if (componentDirectoryRelative === undefined) {
    throwError(`The specified component is unknown: '${componentName}'`);
  }

  const componentDirectory = join(rootDirectory, componentDirectoryRelative);

  if (!existsSync(componentDirectory)) {
    throwError(
      `The '${componentName}' component references a directory that doesn't exist: ${componentDirectory}`
    );
  }

  const componentConfig = await loadConfig(componentDirectory);

  if (componentConfig === undefined) {
    throwError(`Couldn't find a configuration file for the '${componentName}' component`);
  }

  componentConfig.environment = {...rootConfig.environment, ...componentConfig.environment};

  if (componentConfig.stages !== undefined) {
    merge(componentConfig, componentConfig.stages[stage]);
    delete componentConfig.stages;
  }

  return componentConfig;
}

async function loadConfig(directory: string): Promise<any> {
  let config = await _loadConfig(directory, CONFIG_FILE_NAME);

  const privateConfig = await _loadConfig(directory, PRIVATE_CONFIG_FILE_NAME);

  if (privateConfig !== undefined) {
    if (config !== undefined) {
      merge(config, privateConfig);
    } else {
      config = privateConfig;
    }
  }

  return config;
}

async function _loadConfig(directory: string, configFileName: string): Promise<any> {
  const file = join(directory, configFileName);

  if (!existsSync(file)) {
    return undefined;
  }

  const {default: configBuilder} = await import(file);

  const config = await configBuilder();

  config.__directory = directory;

  if (config.environment === undefined) {
    config.environment = {};
  }

  return config;
}
