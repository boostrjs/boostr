import {BaseService, BaseServiceAttributes} from './base.js';
import type {Command} from '../command.js';
import type {ApplicationService} from './application.js';

export type SubserviceAttributes = BaseServiceAttributes & {name: string};

export abstract class Subservice extends BaseService {
  static isRoot = false;

  constructor({name, ...otherAttributes}: SubserviceAttributes) {
    super(otherAttributes);

    this._name = name;
  }

  _name!: string;

  getName() {
    return this._name;
  }

  _applicationService!: ApplicationService;

  getApplicationService() {
    return this._applicationService;
  }

  _dependencies: Subservice[] = [];
  _dependents: Subservice[] = [];

  registerDependency(service: Subservice) {
    this._dependencies.push(service);
    service._dependents.push(this);
  }

  getDependencies() {
    return this._dependencies;
  }

  getDependents() {
    return this._dependents;
  }

  parseConfigURL() {
    const directory = this.getDirectory();
    const config = this.getConfig();

    const {protocol, hostname, port, pathname} = this._parseConfigURL();

    if (config.platform === 'local') {
      if (protocol !== 'http:') {
        this.throwError(
          `The 'url' property in the configuration should start with 'http://' (directory: '${directory}')`
        );
      }

      if (hostname !== 'localhost') {
        this.throwError(
          `The host of the 'url' property in the configuration should be 'localhost' (directory: '${directory}')`
        );
      }

      if (!port) {
        this.throwError(
          `The 'url' property in the configuration should specify a port (directory: '${directory}')`
        );
      }

      if (pathname !== '/') {
        this.throwError(
          `The path of the 'url' property in the configuration should be '/' (directory: '${directory}')`
        );
      }
    } else {
      if (protocol !== 'https:') {
        this.throwError(
          `The 'url' property in the configuration should start with 'https://' (directory: '${directory}')`
        );
      }

      if (hostname === 'localhost') {
        this.throwError(
          `The host of the 'url' property in the configuration should not be 'localhost' (directory: '${directory}')`
        );
      }

      if (port) {
        this.throwError(
          `The 'url' property in the configuration should not specify a port (directory: '${directory}')`
        );
      }

      if (pathname !== '/') {
        this.throwError(
          `The path of the 'url' property in the configuration should be '/' (directory: '${directory}')`
        );
      }
    }

    return {protocol, hostname, port, pathname};
  }

  _parseConfigURL() {
    const directory = this.getDirectory();
    const config = this.getConfig();

    if (!config.url) {
      this.throwError(
        `A 'url' property is required in the configuration (directory: '${directory}')`
      );
    }

    let url: URL;

    try {
      url = new URL(config.url);
    } catch {
      this.throwError(
        `An error occurred while parsing the 'url' property in the configuration (directory: '${directory}')`
      );
    }

    const {protocol, hostname, port: portString, pathname} = url;

    const port = Number(portString);

    return {protocol, hostname, port, pathname};
  }

  // === Commands ===

  static commands: Record<string, Command> = {
    ...BaseService.commands,

    install: {
      ...BaseService.commands.install,
      description: 'Installs all the npm dependencies used by your service.',
      examples: ['boostr {{serviceName}} install']
    },

    update: {
      ...BaseService.commands.update,
      description: 'Updates all the npm dependencies used by your service.',
      examples: ['boostr {{serviceName}} update']
    },

    check: {
      ...BaseService.commands.check,
      examples: ['boostr {{serviceName}} check']
    },

    build: {
      ...BaseService.commands.build,
      examples: ['boostr {{serviceName}} build']
    },

    test: {
      ...BaseService.commands.test,
      description: 'Tests your service.',
      examples: ['boostr {{serviceName}} test']
    },

    start: {
      ...BaseService.commands.start,
      description: 'Starts your service (and the services it depends on) in development mode.',
      examples: ['boostr {{serviceName}} start']
    },

    deploy: {
      ...BaseService.commands.deploy,
      description: 'Deploys your service (and the services it depends on) to the specified stage.',
      examples: [
        'boostr {{serviceName}} deploy --production',
        'boostr {{serviceName}} deploy --staging --skip=legacyBackend'
      ]
    },

    config: {
      ...BaseService.commands.config,
      description: 'Shows your service configuration.',
      examples: ['boostr {{serviceName}} config']
    },

    exec: {
      ...BaseService.commands.exec,
      description: 'Executes any shell command in your service directory.',
      examples: ['boostr {{serviceName}} exec -- npm install lodash']
    }
  };

  async start() {
    await super.start();
    await this.startDependencies();
  }

  async startDependencies() {
    for (const service of this.getDependencies()) {
      if (!service._hasBeenStarted) {
        await service.start();
      }
    }
  }

  async stopDependencies() {
    for (const service of this.getDependencies()) {
      if (!service._hasBeenStopped) {
        await service.stop();
      }
    }
  }

  async deploy({skipServiceNames = []}: {skipServiceNames?: string[]} = {}) {
    await super.deploy({skipServiceNames});

    for (const service of this.getDependencies()) {
      if (!service._hasBeenDeployed) {
        await service.deploy({skipServiceNames});
      }
    }
  }
}
