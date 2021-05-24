import {BaseService} from './base.js';
import type {Subservice} from './sub.js';
import type {Command} from '../command.js';
import {DatabaseService} from './database.js';

export class ApplicationService extends BaseService {
  static type = 'application';

  static description =
    'The root of your application, which is composed of different services. A typical application is composed of a frontend, a backend, and a database.';

  static examples = ['boostr start', 'boostr deploy --production', 'boostr database migrate'];

  static isRoot = true;

  getName() {
    return 'root';
  }

  _services: Subservice[] = [];

  getService(name: string) {
    const service = this._getService(name);

    if (service === undefined) {
      this.throwError(
        `Couldn't find a service named '${name}' in the application configuration (directory: '${this.getDirectory()}')`
      );
    }

    return service;
  }

  hasService(name: string) {
    return this._getService(name) !== undefined;
  }

  _getService(name: string) {
    return this._services.find((service) => service.getName() === name);
  }

  registerService(service: Subservice) {
    this._services.push(service);
    service._applicationService = this;
  }

  getServices() {
    return this._services;
  }

  getRootServices() {
    return this._services.filter((service) => service.getDependents().length === 0);
  }

  // === Commands ===

  static commands: Record<string, Command> = {
    ...BaseService.commands,

    // TODO: Rewrite all descriptions to take into account the case of a service is specified

    install: {
      ...BaseService.commands.install,
      description: 'Install all the npm dependencies.',
      examples: ['boostr install', 'boostr frontend install']
    },

    update: {
      ...BaseService.commands.update,
      description: 'Update all the npm dependencies.',
      examples: ['boostr update', 'boostr frontend update']
    },

    check: {
      ...BaseService.commands.check,
      examples: ['boostr check', 'boostr frontend check']
    },

    build: {
      ...BaseService.commands.build,
      examples: ['boostr build', 'boostr frontend build']
    },

    start: {
      ...BaseService.commands.start,
      description: 'Start your application (or a subset of services) in development mode.',
      examples: ['boostr start', 'boostr backend start']
    },

    migrate: {
      ...BaseService.commands.migrate,
      description: 'Migrate one or more databases.',
      async handler(this: ApplicationService) {
        await this.migrate();
      },
      examples: ['boostr migrate', 'boostr database migrate']
    },

    deploy: {
      ...BaseService.commands.deploy,
      description: 'Deploy your application (or a subset of services) to a specific stage.',
      examples: [
        'boostr deploy --production',
        'boostr deploy --staging --skip=legacyBackend',
        'boostr frontend deploy --production'
      ]
    },

    config: {
      ...BaseService.commands.config,
      description: 'Show the root (or a specified service) configuration.',
      examples: ['boostr config', 'boostr frontend config']
    },

    npm: {
      ...BaseService.commands.npm,
      description:
        'Run npm in the root directory of your application (or in the directory of a service).',
      examples: ['boostr npm install eslint --save-dev', 'boostr backend npm install lodash']
    }
  };

  async install() {
    await super.install();

    for (const service of this.getServices()) {
      await service.install();
    }
  }

  async update() {
    await super.update();

    for (const service of this.getServices()) {
      await service.update();
    }
  }

  async check() {
    await super.check();

    for (const service of this.getServices()) {
      await service.check();
    }
  }

  async build() {
    await super.build();

    for (const service of this.getServices()) {
      await service.build();
    }
  }

  async start() {
    await super.start();

    for (const service of this.getRootServices()) {
      await service.start();
    }
  }

  async migrate() {
    for (const service of this.getServices()) {
      if (service instanceof DatabaseService) {
        await service.migrate();
      }
    }
  }

  async deploy({skipServiceNames = []}: {skipServiceNames?: string[]} = {}) {
    await super.deploy({skipServiceNames});

    for (const service of this.getRootServices()) {
      await service.deploy({skipServiceNames});
    }
  }
}
