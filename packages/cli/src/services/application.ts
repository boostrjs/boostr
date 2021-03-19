import {BaseService} from './base.js';
import type {Subservice} from './sub.js';
import type {Command} from '../command.js';

export class ApplicationService extends BaseService {
  static type = 'application';

  static help = 'Application help...';

  static isRoot = true;

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

  // === Commands ===

  static commands: Record<string, Command> = {
    ...BaseService.commands
  };

  async install() {
    await super.install();

    for (const service of this.getServices()) {
      await service.install();
    }
  }
}
