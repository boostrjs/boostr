import {readFileSync} from 'fs';

const packageURL = new URL('../package.json', import.meta.url);

const {name: programName, version: programVersion} = JSON.parse(
  readFileSync(packageURL as any, 'utf-8')
);

export {programName, programVersion};

export function logMessage(message: string, {serviceName}: {serviceName?: string} = {}) {
  console.log(prefixMessageWithServiceName(message, serviceName));
}

export function logError(message: string, {serviceName}: {serviceName?: string} = {}) {
  console.error(prefixMessageWithServiceName(message, serviceName));
}

export function throwError(message: string, {serviceName}: {serviceName?: string} = {}): never {
  throw Object.assign(new Error('Error'), {
    displayMessage: message,
    serviceName
  });
}

export function prefixMessageWithServiceName(message: string, serviceName?: string) {
  if (serviceName !== undefined) {
    message = `[${serviceName}] ${message}`;
  }

  return message;
}
