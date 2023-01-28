import {BaseService} from './base.js';
import type {Subservice} from './sub.js';
import type {Command} from '../command.js';
import {DatabaseService} from './database.js';

export class ApplicationService extends BaseService {
  static type = 'application';

  static description =
    'The root of your app, which is composed of different services. A typical app is composed of a frontend, a backend, and a database.';

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
        `Couldn't find a service named '${name}' in the app configuration (directory: '${this.getDirectory()}')`
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

    install: {
      ...BaseService.commands.install,
      description: 'Installs all the npm dependencies used in your app (or a specified service).',
      examples: ['boostr install', 'boostr frontend install']
    },

    update: {
      ...BaseService.commands.update,
      description: 'Updates all the npm dependencies used in your app (or a specified service).',
      examples: [
        'boostr update',
        'boostr update --save',
        'boostr frontend update',
        'boostr frontend update --save'
      ]
    },

    check: {
      ...BaseService.commands.check,
      examples: ['boostr check', 'boostr frontend check']
    },

    build: {
      ...BaseService.commands.build,
      examples: ['boostr build', 'boostr frontend build']
    },

    test: {
      ...BaseService.commands.test,
      description:
        'Tests all the services of your app (or a specified service) in development mode.',
      examples: ['boostr test', 'boostr backend test']
    },

    start: {
      ...BaseService.commands.start,
      description: 'Starts your app (or a specified service) in development mode.',
      examples: ['boostr start', 'boostr backend start']
    },

    migrate: {
      ...BaseService.commands.migrate,
      description: 'Migrates one or more databases used by your app.',
      async handler(this: ApplicationService) {
        await this.migrate();
      },
      examples: ['boostr migrate', 'boostr database migrate']
    },

    deploy: {
      ...BaseService.commands.deploy,
      description: 'Deploys your app (or a specified service) to the specified stage.',
      examples: [
        'boostr deploy --production',
        'boostr backend deploy --production',
        'boostr deploy --staging --skip=legacyBackend'
      ]
    },

    config: {
      ...BaseService.commands.config,
      description: 'Displays the root (or a specified service) configuration.',
      examples: ['boostr config', 'boostr frontend config']
    },

    exec: {
      ...BaseService.commands.exec,
      description:
        'Executes any shell command in the root directory of your app (or in the directory of a specified service).',
      examples: [
        'boostr exec -- npx prettier --check .',
        'boostr backend exec -- npm install lodash'
      ]
    }
  };

  async install() {
    await super.install();

    for (const service of this.getServices()) {
      await service.install();
    }
  }

  async update({save = false}: {save?: boolean} = {}) {
    await super.update({save});

    for (const service of this.getServices()) {
      await service.update({save});
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

  async test() {
    for (const service of this.getServices()) {
      await service.test();
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
