import {ApplicationService} from './application.js';
import {BackendService} from './backend.js';
import {DatabaseService} from './database.js';
import {WebFrontendService} from './web-frontend.js';
import {loadApplicationConfig, loadServiceConfig} from '../config.js';
import {throwError} from '../utilities.js';

export async function createApplicationServiceFromDirectory(
  directory: string,
  {stage}: {stage: string}
) {
  let applicationConfig = await loadApplicationConfig(directory, {stage});

  if (applicationConfig === undefined) {
    return undefined;
  }

  const applicationService = createApplicationService({config: applicationConfig, stage});

  for (const serviceName of Object.keys(applicationConfig.services)) {
    const serviceConfig = await loadServiceConfig(serviceName, {applicationConfig, stage});

    const service = createSubservice({config: serviceConfig, stage, name: serviceName});

    applicationService.registerService(service);
  }

  for (const service of applicationService.getServices()) {
    const dependsOn = service.getConfig().dependsOn ?? [];

    const dependencyNames: string[] = Array.isArray(dependsOn) ? dependsOn : [dependsOn];

    for (const dependencyName of dependencyNames) {
      if (!applicationService.hasService(dependencyName)) {
        throwError(
          `Unknown service '${dependencyName}' encountered in the 'dependsOn' property of a configuration (directory: '${service.getDirectory()}')`
        );
      }

      service.registerDependency(applicationService.getService(dependencyName));
    }
  }

  return applicationService;
}

function createApplicationService({config, stage}: {config: any; stage: string}) {
  const {__directory: directory} = config as {__directory: string};

  return new ApplicationService({directory, config, stage});
}

const subserviceClasses = [WebFrontendService, BackendService, DatabaseService];

function createSubservice({config, stage, name}: {config: any; stage: string; name: string}) {
  const {type, __directory: directory} = config as {type: string; __directory: string};

  let subserviceClass = subserviceClasses.find((subserviceClass) => subserviceClass.type === type);

  if (subserviceClass === undefined) {
    throwError(
      `Unknown service type '${type}' encountered in a configuration (directory: '${directory}')`
    );
  }

  return new subserviceClass({directory, config, stage, name});
}
