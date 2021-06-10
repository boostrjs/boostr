import type {build as buildFunction, BuildOptions, BuildResult} from 'esbuild';
import {join} from 'path';
import bytes from 'bytes';
import isEmpty from 'lodash/isEmpty.js';

import {
  loadNPMPackage,
  requireGlobalNPMPackage,
  installNPMPackages,
  findInstalledNPMPackage
} from './npm.js';
import {logMessage, logError, throwError, resolveVariables, getFileSize} from './util.js';

export async function build({
  serviceDirectory,
  buildDirectory,
  bundleFileNameWithoutExtension = 'bundle',
  bootstrapTemplate,
  serviceName,
  stage,
  environment = {},
  external = [],
  builtInExternal = [],
  sourceMap = false,
  minify = false,
  freeze = false,
  installExternalDependencies = false,
  watch = false,
  esbuildOptions
}: {
  serviceDirectory: string;
  buildDirectory: string;
  bundleFileNameWithoutExtension?: string;
  bootstrapTemplate: string;
  serviceName?: string;
  stage: string;
  environment?: Record<string, string>;
  external?: string[];
  builtInExternal?: string[];
  sourceMap?: boolean;
  minify?: boolean;
  freeze?: boolean;
  installExternalDependencies?: boolean;
  watch?: {afterRebuild?: () => void} | boolean;
  esbuildOptions?: BuildOptions;
}) {
  if (freeze && watch) {
    throw Error("You cannot use both 'freeze' and 'watch'");
  }

  const pkg = loadNPMPackage(serviceDirectory);

  const entryPoint = pkg.main;

  if (entryPoint === undefined) {
    throwError(
      `A 'main' property is missing in a 'package.json' file (directory: '${serviceDirectory}')`,
      {serviceName}
    );
  }

  const bootstrapCode = resolveVariables(bootstrapTemplate, {entryPoint});

  // Include CLI's node_modules folder so that packages such as @layr/component-http-server
  // or @layr/aws-integration can be found even though they are not installed by the user
  const nodePaths = [new URL('../node_modules', import.meta.url).pathname];

  const definedIdentifers: Record<string, string> = {'process.env.NODE_ENV': `"${stage}"`};

  for (const [name, value] of Object.entries(environment)) {
    definedIdentifers[`process.env.${name}`] = `"${value}"`;
  }

  const {build}: {build: typeof buildFunction} = await requireGlobalNPMPackage(
    'esbuild',
    '0.12.8',
    {
      serviceName
    }
  );

  let bundleFile: string;
  let result: BuildResult;

  try {
    result = await build({
      absWorkingDir: serviceDirectory,
      outdir: buildDirectory,
      stdin: {
        contents: bootstrapCode,
        resolveDir: serviceDirectory,
        sourcefile: 'bootstrap.js'
      },
      nodePaths,
      bundle: true,
      entryNames: freeze
        ? `${bundleFileNameWithoutExtension}-[hash].immutable`
        : bundleFileNameWithoutExtension,
      assetNames: freeze ? '[name]-[hash].immutable' : '[name]',
      define: definedIdentifers,
      external: [...external, ...builtInExternal],
      metafile: true,
      loader: {
        '.png': 'file',
        '.jpeg': 'file',
        '.jpg': 'file',
        '.gif': 'file',
        '.webp': 'file',
        '.svg': 'file',
        '.svgz': 'file'
      },
      sourcemap: sourceMap,
      ...(minify && {
        minify: true,
        keepNames: true
      }),
      ...(watch !== false && {
        watch: {
          onRebuild: (error) => {
            if (error) {
              logError('Rebuild failed', {serviceName});
            } else {
              logMessage(`Rebuild succeeded (bundle size: ${bytes(getFileSize(bundleFile))})`, {
                serviceName
              });

              if (typeof watch === 'object' && watch.afterRebuild !== undefined) {
                watch.afterRebuild();
              }
            }
          }
        }
      }),
      ...esbuildOptions
    });
  } catch {
    throwError('Build failed', {serviceName});
  }

  if (installExternalDependencies) {
    const externalDependencies: Record<string, string> = {};

    for (const packageName of external) {
      // const version = pkg.dependencies?.[packageName];
      const externalPackage = findInstalledNPMPackage(serviceDirectory, packageName);

      if (externalPackage === undefined) {
        throwError(
          `Couldn't find the npm package '${packageName}' specified as an external dependency`,
          {serviceName}
        );
      }

      externalDependencies[packageName] = externalPackage.version;
    }

    if (!isEmpty(externalDependencies)) {
      logMessage('Installing external dependencies...', {serviceName});
      await installNPMPackages(buildDirectory, externalDependencies);
    }
  }

  bundleFile = determineBundleFileFromBuildResult(result, {serviceDirectory, serviceName});

  logMessage(`Build succeeded (bundle size: ${bytes(getFileSize(bundleFile))})`, {serviceName});

  return bundleFile;
}

function determineBundleFileFromBuildResult(
  result: BuildResult,
  {serviceDirectory, serviceName}: {serviceDirectory: string; serviceName?: string}
) {
  let bundleFile: string | undefined;

  const outputs = result?.metafile?.outputs ?? {};

  for (const [file, output] of Object.entries(outputs)) {
    if (output.entryPoint === 'bootstrap.js') {
      bundleFile = join(serviceDirectory, file);
    }
  }

  if (bundleFile === undefined) {
    throwError("Couldn't determine the name of generated bundle", {serviceName});
  }

  return bundleFile;
}
