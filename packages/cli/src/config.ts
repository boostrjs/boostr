import {existsSync} from 'fs';
import {join, resolve} from 'path';
import merge from 'lodash/merge.js';

import {throwError} from './util.js';

const CONFIG_FILE_NAME = 'boostr.config.js';
const PRIVATE_CONFIG_FILE_NAME = 'boostr.config.private.js';
const DEFAULT_STAGE = 'development';

const COMPONENT_MOCK: any = new Proxy(Object.create(null), {
  get: () => COMPONENT_MOCK
});

export async function loadRootConfig(directory: string) {
  while (true) {
    const config = await loadConfig(directory);

    if (config !== undefined && config.type === 'application') {
      if (config.components === undefined) {
        config.components = {};
      }

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

async function preloadComponentConfigs(rootConfig: any, {stage}: {stage: string}) {
  if (rootConfig.__preloadedComponentConfigs !== undefined) {
    return;
  }

  Object.defineProperty(rootConfig, '__preloadedComponentConfigs', {value: {}});

  for (const componentName of Object.keys(rootConfig.components)) {
    rootConfig.__preloadedComponentConfigs[componentName] = COMPONENT_MOCK;
  }

  for (const componentName of Object.keys(rootConfig.components)) {
    rootConfig.__preloadedComponentConfigs[componentName] = await loadComponentConfig(
      rootConfig,
      componentName,
      {stage}
    );
  }
}

export async function loadComponentConfig(
  rootConfig: any,
  componentName: string,
  {stage = DEFAULT_STAGE}: {stage?: string} = {}
) {
  await preloadComponentConfigs(rootConfig, {stage});

  const rootDirectory = rootConfig.__directory;
  const componentDirectoryRelative = rootConfig?.components[componentName];

  if (componentDirectoryRelative === undefined) {
    throwError(`The specified component is unknown: '${componentName}'`);
  }

  const componentDirectory = resolve(rootDirectory, componentDirectoryRelative);

  if (!existsSync(componentDirectory)) {
    throwError(
      `The '${componentName}' component references a directory that doesn't exist: ${componentDirectory}`
    );
  }

  const componentConfig = await loadConfig(componentDirectory, {
    preloadedComponentConfigs: rootConfig.__preloadedComponentConfigs
  });

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

async function loadConfig(
  directory: string,
  {preloadedComponentConfigs}: {preloadedComponentConfigs?: any} = {}
): Promise<any> {
  let config = await _loadConfig(directory, CONFIG_FILE_NAME, {preloadedComponentConfigs});

  const privateConfig = await _loadConfig(directory, PRIVATE_CONFIG_FILE_NAME, {
    preloadedComponentConfigs
  });

  if (privateConfig !== undefined) {
    if (config !== undefined) {
      merge(config, privateConfig);
    } else {
      config = privateConfig;
    }
  }

  return config;
}

async function _loadConfig(
  directory: string,
  configFileName: string,
  {preloadedComponentConfigs}: {preloadedComponentConfigs: any}
): Promise<any> {
  const file = join(directory, configFileName);

  if (!existsSync(file)) {
    return undefined;
  }

  let configBuilder;

  try {
    configBuilder = (await import(file)).default;
  } catch (error) {
    throwError(`An error occurred while loading a configuration file\n${error.message}`);
  }

  let config;

  try {
    config = await configBuilder({components: preloadedComponentConfigs});
  } catch (error) {
    throwError(`An error occurred while evaluating a configuration file\n${error.stack}`);
  }

  Object.defineProperty(config, '__directory', {value: directory});

  if (config.environment === undefined) {
    config.environment = {};
  }

  return config;
}
