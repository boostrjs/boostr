import {logMessage, logError, throwError} from '../util.js';

export type BaseResourceConfig = {
  domainName: string;
};

export type ResourceOptions = {
  serviceName?: string;
};

export class BaseResource {
  ['constructor']!: typeof BaseResource;

  static managerIdentifiers = ['boostr-v1', 'simple-deployment-v1'];

  constructor(config: BaseResourceConfig, {serviceName}: ResourceOptions = {}) {
    this._serviceName = serviceName;
    this._config = this.normalizeConfig(config);
  }

  _config!: ReturnType<BaseResource['normalizeConfig']>;

  getConfig<T extends BaseResource>(this: T) {
    return this._config as T['_config'];
  }

  normalizeConfig(config: BaseResourceConfig) {
    const {domainName} = config;

    if (!domainName) {
      this.throwError(`A 'domainName' property is required in the configuration`);
    }

    return {domainName};
  }

  _serviceName!: any;

  getServiceName() {
    return this._serviceName;
  }

  // === Utilities ===

  logMessage(message: string) {
    logMessage(message, {serviceName: this.getServiceName()});
  }

  logError(message: string) {
    logError(message, {serviceName: this.getServiceName()});
  }

  throwError(message: string): never {
    throwError(message, {serviceName: this.getServiceName()});
  }
}
