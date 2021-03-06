import {existsSync} from 'fs';
import {join} from 'path';

const CONFIG_FILE_NAME = 'boostr.config.js';

export async function loadRootConfigFile(directory: string) {
  while (true) {
    const configFile = join(directory, CONFIG_FILE_NAME);

    if (existsSync(configFile)) {
      const config = await loadConfigFile(configFile);

      if (config.type === 'application') {
        return config;
      }
    }

    const parentDirectory = join(directory, '..');

    if (parentDirectory === directory) {
      break;
    }

    directory = parentDirectory;
  }

  return undefined;
}

async function loadConfigFile(file: string): Promise<any> {
  const {default: configBuilder} = await import(file);

  const config = await configBuilder();

  return config;
}
