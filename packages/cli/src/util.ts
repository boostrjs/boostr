import {readFileSync, statSync} from 'fs';
import hasha from 'hasha';
import baseX from 'base-x';

const base62 = baseX('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');

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

export function resolveVariables(string: string, variables: Record<string, any>) {
  for (const [name, value] of Object.entries(variables)) {
    string = string.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), String(value));
  }

  return string;
}

export function getFileSize(file: string) {
  return statSync(file).size;
}

export function generateHashFromFile(file: string) {
  const md5 = hasha.fromFileSync(file, {encoding: 'buffer', algorithm: 'md5'});
  return base62.encode(md5);
}
