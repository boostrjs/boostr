import {execFileSync} from 'child_process';
import {readdirSync, readFileSync, writeFileSync} from 'fs';
import {join, basename, extname} from 'path';
import tempy from 'tempy';
import fsExtra from 'fs-extra';
import tar from 'tar';
import walkSync from 'walk-sync';
import without from 'lodash/without.js';
import kebabCase from 'lodash/kebabCase.js';

import {createApplicationServiceFromDirectory} from './services/index.js';
import {logMessage, throwError, resolveVariables} from './util.js';

const POPULATABLE_TEMPLATE_FILE_EXTENSIONS = ['.js', '.mjs', '.jsx', '.ts', 'tsx', '.json', '.md'];

export async function initialize(
  directory: string,
  {template, name}: {template?: string; name?: string} = {},
  {stage, showHelp = false}: {stage: string; showHelp?: boolean}
) {
  if (showHelp) {
    console.log('Initialize help...');
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

  let projectName: string;

  if (name !== undefined) {
    projectName = name;
  } else {
    projectName = kebabCase(basename(directory));
  }

  logMessage('Fetching template...');

  await fetchTemplate(template, directory);
  await populateVariables(directory, {projectName});

  logMessage('Installing npm dependencies...');

  const applicationService = await createApplicationServiceFromDirectory(directory, {stage});
  await applicationService!.install();

  logMessage(
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
    const populatedContent = resolveVariables(originalContent, variables);

    if (populatedContent !== originalContent) {
      writeFileSync(file, populatedContent);
    }
  }
}

function directoryIsEmpty(
  directory: string,
  {ignoreDirectoryNames = []}: {ignoreDirectoryNames?: string[]} = {}
) {
  const entries = without(readdirSync(directory), ...ignoreDirectoryNames);

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
