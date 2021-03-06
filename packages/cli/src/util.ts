import {readFileSync} from 'fs';

const packageURL = new URL('../package.json', import.meta.url);

const {name: programName, version: programVersion} = JSON.parse(
  readFileSync(packageURL as any, 'utf-8')
);

export {programName, programVersion};

export function logMessage(message: string) {
  console.log(`${programName}: ${message}`);
}

export function logError(message: string) {
  console.error(`${programName}: ${message}`);
}

export function throwError(message: string): never {
  throw Object.assign(new Error('Error'), {
    displayMessage: message
  });
}
