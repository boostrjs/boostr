import {existsSync} from 'fs';
import {join, resolve} from 'path';
import merge from 'lodash/merge.js';

import {throwError} from './util.js';

const CONFIG_FILE_NAME = 'boostr.config.js';
const PRIVATE_CONFIG_FILE_NAME = 'boostr.config.private.js';

const BLACK_HOLE: any = new Proxy(Object.create(null), {
  get: () => BLACK_HOLE
});

export async function loadApplicationConfig(directory: string, {stage}: {stage: string}) {
  while (true) {
    const config = await loadConfig(directory, {stage});

    if (config !== undefined && config.type === 'application') {
      await _preloadServiceConfigs(config, {stage});

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

async function _preloadServiceConfigs(applicationConfig: any, {stage}: {stage: string}) {
  if (applicationConfig.services === undefined) {
    applicationConfig.services = {};
  }

  Object.defineProperty(applicationConfig, '__preloadedServiceConfigs', {value: {}});

  for (const serviceName of Object.keys(applicationConfig.services)) {
    applicationConfig.__preloadedServiceConfigs[serviceName] = BLACK_HOLE;
  }

  for (const serviceName of Object.keys(applicationConfig.services)) {
    applicationConfig.__preloadedServiceConfigs[serviceName] = await loadServiceConfig(
      serviceName,
      {
        applicationConfig,
        stage
      }
    );
  }
}

export async function loadServiceConfig(
  serviceName: string,
  {applicationConfig, stage}: {applicationConfig: any; stage: string}
) {
  const rootDirectory = applicationConfig.__directory;
  const serviceDirectoryRelative = applicationConfig?.services[serviceName];

  if (serviceDirectoryRelative === undefined) {
    throwError(`The specified service is unknown: '${serviceName}'`);
  }

  const serviceDirectory = resolve(rootDirectory, serviceDirectoryRelative);

  if (!existsSync(serviceDirectory)) {
    throwError(
      `The '${serviceName}' service references a directory that doesn't exist: ${serviceDirectory}`
    );
  }

  const serviceConfig = await loadConfig(serviceDirectory, {applicationConfig, stage});

  if (serviceConfig === undefined) {
    throwError(`Couldn't find a configuration file for the '${serviceName}' service`);
  }

  return serviceConfig;
}

async function loadConfig(
  directory: string,
  {applicationConfig, stage}: {applicationConfig?: any; stage: string}
): Promise<any> {
  let config = await _loadConfig(directory, CONFIG_FILE_NAME, {applicationConfig, stage});

  const privateConfig = await _loadConfig(directory, PRIVATE_CONFIG_FILE_NAME, {
    applicationConfig,
    stage
  });

  if (privateConfig !== undefined) {
    if (config !== undefined) {
      merge(config, privateConfig);
    } else {
      config = privateConfig;
    }
  }

  if (config === undefined) {
    return undefined;
  }

  if (config.type === undefined) {
    throwError(`Couldn't find a 'type' property in a configuration (directory: '${directory}')`);
  }

  return config;
}

async function _loadConfig(
  directory: string,
  configFileName: string,
  {applicationConfig, stage}: {applicationConfig?: any; stage: string}
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
    config = await configBuilder({
      services: applicationConfig?.__preloadedServiceConfigs ?? BLACK_HOLE
    });
  } catch (error) {
    throwError(`An error occurred while evaluating a configuration file\n${error.stack}`);
  }

  Object.defineProperty(config, '__directory', {value: directory});

  config.environment = {...applicationConfig?.environment, ...config.environment};

  if (config.stages !== undefined) {
    merge(config, config.stages[stage]);
    delete config.stages;
  }

  return config;
}
