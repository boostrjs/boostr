import {BaseService, BaseServiceAttributes} from './base.js';
import type {ApplicationService} from './application.js';
import {logMessage, logError, throwError} from '../util.js';

export type SubserviceAttributes = BaseServiceAttributes & {name: string};

export class Subservice extends BaseService {
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

  logMessage(message: string) {
    logMessage(message, {serviceName: this.getName()});
  }

  logError(message: string) {
    logError(message, {serviceName: this.getName()});
  }

  throwError(message: string): never {
    throwError(message, {serviceName: this.getName()});
  }
}
