import {readFileSync} from 'fs';

const packageURL = new URL('../package.json', import.meta.url);

const {name: programName, version: programVersion} = JSON.parse(
  readFileSync(packageURL as any, 'utf-8')
);

export {programName, programVersion};

export function logMessage(message: string, {componentName}: {componentName?: string} = {}) {
  console.log(prefixMessageWithComponentName(message, componentName));
}

export function logError(message: string, {componentName}: {componentName?: string} = {}) {
  console.error(prefixMessageWithComponentName(message, componentName));
}

export function throwError(message: string, {componentName}: {componentName?: string} = {}): never {
  throw Object.assign(new Error('Error'), {
    displayMessage: message,
    componentName
  });
}

export function prefixMessageWithComponentName(message: string, componentName?: string) {
  if (componentName !== undefined) {
    message = `[${componentName}] ${message}`;
  }

  return message;
}
