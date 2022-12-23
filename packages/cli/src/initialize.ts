import {execFileSync} from 'child_process';
import {readFileSync, writeFileSync} from 'fs';
import {join, basename, extname} from 'path';
import {temporaryDirectoryTask} from 'tempy';
import tar from 'tar';
import walkSync from 'walk-sync';
import kebabCase from 'lodash/kebabCase.js';

import {createApplicationServiceFromDirectory} from './services/index.js';
import {GLOBAL_OPTIONS_HELP_OBJECT} from './argument-parser.js';
import {formatHelp} from './help.js';
import {
  logMessage,
  throwError,
  resolveVariables,
  directoryExists,
  directoryIsEmpty
} from './utilities.js';

const INITIALIZE_HELP = formatHelp({
  'Command': 'initialize',

  'Alias': 'init',

  'Description': 'Initialize your app within the current directory.',

  'Usage': 'boostr initialize --template=<package> [options]',

  'Options': {
    '--template': 'Specify an npm package name to be used as template.',
    '--name': 'Specify the name of your app (default: the name of the current directory).'
  },

  'Examples': [
    'boostr initialize --template=@boostr/web-application-ts',
    'boostr init --template=@boostr/web-application-js --name=my-app'
  ],

  'Global Options': GLOBAL_OPTIONS_HELP_OBJECT
});

const POPULATABLE_TEMPLATE_FILE_EXTENSIONS = ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.json', '.md'];

export async function initialize(
  directory: string,
  {template, name}: {template?: string; name?: string} = {},
  {stage, showHelp = false}: {stage: string; showHelp?: boolean}
) {
  if (showHelp) {
    console.log(INITIALIZE_HELP);
    return;
  }

  if (!directoryIsEmpty(directory, {ignoreDirectoryNames: ['.git', '.DS_Store']})) {
    throwError(`Sorry, the 'initialize' command can only be used within an empty directory`);
  }

  if (template === undefined) {
    throwError(
      `Please specify a template with the --template option (example: \`boostr initialize --template=@boostr/web-application-js\`)`
    );
  }

  let applicationName: string;

  if (name !== undefined) {
    applicationName = name;
  } else {
    applicationName = kebabCase(basename(directory));
  }

  logMessage('Fetching template...');

  await fetchTemplate(template, directory);
  await populateVariables(directory, {applicationName});

  if (!directoryExists(join(directory, '.git'))) {
    logMessage('Initializing Git directory...');
    await initializeGitDirectory(directory);
  }

  logMessage('Installing npm dependencies...');

  const applicationService = await createApplicationServiceFromDirectory(directory, {stage});
  await applicationService!.install();

  logMessage('Application successfully initialized');
  logMessage('Run `boostr start` to start the development environment');
}

async function fetchTemplate(name: string, directory: string) {
  await temporaryDirectoryTask(async (temporaryDirectory) => {
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

async function populateVariables(directory: string, {applicationName}: {applicationName: string}) {
  const randomPort = Math.floor(Math.random() * 9990) + 10000;

  const variables = {
    applicationName,
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
    const populatedContent = resolveVariables(originalContent, variables);

    if (populatedContent !== originalContent) {
      writeFileSync(file, populatedContent);
    }
  }
}

async function initializeGitDirectory(directory: string) {
  execFileSync('git', ['init', '--initial-branch=main'], {
    cwd: directory,
    stdio: 'inherit'
  });
}
