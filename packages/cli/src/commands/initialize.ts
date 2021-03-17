import {execFileSync} from 'child_process';
import {readdirSync, readFileSync, writeFileSync} from 'fs';
import {join, basename, extname} from 'path';
import tempy from 'tempy';
import fsExtra from 'fs-extra';
import tar from 'tar';
import walkSync from 'walk-sync';
import kebabCase from 'lodash/kebabCase.js';

import type {Command} from './index.js';
import {install} from './install.js';
import {loadRootConfig} from '../config.js';
import {throwError} from '../util.js';

const POPULATABLE_TEMPLATE_FILE_EXTENSIONS = ['.js', '.mjs', '.jsx', '.ts', 'tsx', '.json', '.md'];

export default {
  name: 'initialize',
  aliases: ['init'],
  options: {
    template: {
      type: 'string'
    },
    name: {
      type: 'string'
    },
    help: {
      aliases: ['h']
    }
  },
  async handler(
    [],
    {template, name, help}: {template?: string; name?: string; help?: boolean},
    {directory, config}
  ) {
    if (help) {
      console.log('Initialize help...'); // TODO
      return;
    }

    if (config !== undefined) {
      throwError(
        `Sorry, it seems that this project has already been initialized (a configuration file was found here: ${directory})`
      );
    }

    if (!directoryIsEmpty(directory)) {
      throwError(`Sorry, the 'initialize' command can only be used within an empty directory`);
    }

    if (template === undefined) {
      throwError(
        `Please specify a template with the --template option (example: \`boostr initialize --template=@boostr/web-application-js\`)`
      );
    }

    let projectName: string;

    if (name !== undefined) {
      projectName = name;
    } else {
      projectName = kebabCase(basename(directory));
    }

    await initializeProject({directory, template, projectName});
  }
} as Command;

async function initializeProject({
  directory,
  template,
  projectName
}: {
  directory: string;
  template: string;
  projectName: string;
}) {
  console.log(`Fetching template...`);

  await fetchTemplate(template, directory);
  await populateVariables(directory, {projectName});

  console.log('Installing npm dependencies...');

  const config = await loadRootConfig(directory);
  await install({directory, config});

  console.log(
    'Application successfully initialized. Run `boostr start` to start the development environment.'
  );
}

async function fetchTemplate(name: string, directory: string) {
  await withTemporaryDirectory(async (temporaryDirectory) => {
    try {
      const tarballFileName = execFileSync('npm', ['pack', name, '--silent'], {
        cwd: temporaryDirectory
      })
        .toString()
        .trim();

      const tarballFile = join(temporaryDirectory, tarballFileName);

      try {
        await tar.extract({file: tarballFile, cwd: directory, strip: 2, keep: true}, [
          'package/template'
        ]);
      } catch (error) {
        throwError(`An error occurred while extracting the '${name}' npm package`);
      }
    } catch {
      throwError(`An error occurred while fetching the '${name}' npm package`);
    }
  });
}

async function populateVariables(directory: string, {projectName}: {projectName: string}) {
  const randomPort = Math.floor(Math.random() * 9990) + 10000;

  const variables = {
    projectName,
    frontendPort: randomPort,
    backendPort: randomPort + 1,
    databasePort: randomPort + 2
  };

  const files = walkSync(directory, {directories: false, includeBasePath: true});

  for (const file of files) {
    const extension = extname(file);

    if (!POPULATABLE_TEMPLATE_FILE_EXTENSIONS.includes(extension)) {
      continue;
    }

    const originalContent = readFileSync(file, 'utf-8');

    let populatedContent = originalContent;

    for (const [name, value] of Object.entries(variables)) {
      populatedContent = populatedContent.replace(
        new RegExp(`\\{\\{${name}\\}\\}`, 'g'),
        String(value)
      );
    }

    if (populatedContent !== originalContent) {
      writeFileSync(file, populatedContent);
    }
  }
}

function directoryIsEmpty(directory: string) {
  const entries = readdirSync(directory);

  return entries.length === 0;
}

async function withTemporaryDirectory<ReturnValue extends unknown>(
  task: (temporaryDirectory: string) => Promise<ReturnValue>
) {
  const temporaryDirectory = tempy.directory();

  try {
    return await task(temporaryDirectory);
  } finally {
    fsExtra.removeSync(temporaryDirectory);
  }
}
