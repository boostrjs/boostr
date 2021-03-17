import {existsSync} from 'fs';
import {join, resolve} from 'path';
import merge from 'lodash/merge.js';

import {throwError} from './util.js';

const CONFIG_FILE_NAME = 'boostr.config.js';
const PRIVATE_CONFIG_FILE_NAME = 'boostr.config.private.js';
const DEFAULT_STAGE = 'development';

const SERVICE_MOCK: any = new Proxy(Object.create(null), {
  get: () => SERVICE_MOCK
});

export async function loadRootConfig(directory: string) {
  while (true) {
    const config = await loadConfig(directory);

    if (config !== undefined && config.type === 'application') {
      if (config.services === undefined) {
        config.services = {};
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

async function preloadServiceConfigs(rootConfig: any, {stage}: {stage: string}) {
  if (rootConfig.__preloadedServiceConfigs !== undefined) {
    return;
  }

  Object.defineProperty(rootConfig, '__preloadedServiceConfigs', {value: {}});

  for (const serviceName of Object.keys(rootConfig.services)) {
    rootConfig.__preloadedServiceConfigs[serviceName] = SERVICE_MOCK;
  }

  for (const serviceName of Object.keys(rootConfig.services)) {
    rootConfig.__preloadedServiceConfigs[serviceName] = await loadServiceConfig(
      rootConfig,
      serviceName,
      {stage}
    );
  }
}

export async function loadServiceConfig(
  rootConfig: any,
  serviceName: string,
  {stage = DEFAULT_STAGE}: {stage?: string} = {}
) {
  await preloadServiceConfigs(rootConfig, {stage});

  const rootDirectory = rootConfig.__directory;
  const serviceDirectoryRelative = rootConfig?.services[serviceName];

  if (serviceDirectoryRelative === undefined) {
    throwError(`The specified service is unknown: '${serviceName}'`);
  }

  const serviceDirectory = resolve(rootDirectory, serviceDirectoryRelative);

  if (!existsSync(serviceDirectory)) {
    throwError(
      `The '${serviceName}' service references a directory that doesn't exist: ${serviceDirectory}`
    );
  }

  const serviceConfig = await loadConfig(serviceDirectory, {
    preloadedServiceConfigs: rootConfig.__preloadedServiceConfigs
  });

  if (serviceConfig === undefined) {
    throwError(`Couldn't find a configuration file for the '${serviceName}' service`);
  }

  serviceConfig.environment = {...rootConfig.environment, ...serviceConfig.environment};

  if (serviceConfig.stages !== undefined) {
    merge(serviceConfig, serviceConfig.stages[stage]);
    delete serviceConfig.stages;
  }

  return serviceConfig;
}

async function loadConfig(
  directory: string,
  {preloadedServiceConfigs}: {preloadedServiceConfigs?: any} = {}
): Promise<any> {
  let config = await _loadConfig(directory, CONFIG_FILE_NAME, {preloadedServiceConfigs});

  const privateConfig = await _loadConfig(directory, PRIVATE_CONFIG_FILE_NAME, {
    preloadedServiceConfigs
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
  {preloadedServiceConfigs}: {preloadedServiceConfigs: any}
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
    config = await configBuilder({services: preloadedServiceConfigs});
  } catch (error) {
    throwError(`An error occurred while evaluating a configuration file\n${error.stack}`);
  }

  Object.defineProperty(config, '__directory', {value: directory});

  if (config.environment === undefined) {
    config.environment = {};
  }

  return config;
}
