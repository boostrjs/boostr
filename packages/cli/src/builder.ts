import type {build as buildFunction, BuildOptions, BuildResult} from 'esbuild';
import {join} from 'path';
import bytes from 'bytes';
import isEmpty from 'lodash/isEmpty.js';

import {requireGlobalNPMPackage, installNPMPackages, findInstalledNPMPackage} from './npm.js';
import {logMessage, logError, throwError, resolveVariables, getFileSize} from './utilities.js';

const ESBUILD_PACKAGE_VERSION = '0.16.12';

export async function build({
  serviceDirectory,
  entryPoint,
  buildDirectory,
  bundleFileNameWithoutExtension = 'bundle',
  bootstrapTemplate,
  bootstrapVariables = {},
  serviceName,
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
  entryPoint: string;
  buildDirectory: string;
  bundleFileNameWithoutExtension?: string;
  bootstrapTemplate: string;
  bootstrapVariables?: Record<string, string>;
  serviceName?: string;
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

  const bootstrapCode = resolveVariables(bootstrapTemplate, {...bootstrapVariables, entryPoint});

  // Include CLI's node_modules folder so that packages such as @layr/component-http-server
  // or @layr/aws-integration can be found even though they are not installed by the user
  const nodePaths = [new URL('../node_modules', import.meta.url).pathname];

  const definedIdentifiers: Record<string, string> = esbuildOptions?.define ?? {};

  for (const [name, value] of Object.entries(environment)) {
    definedIdentifiers[`process.env.${name}`] = `"${value}"`;
  }

  const {build}: {build: typeof buildFunction} = await requireGlobalNPMPackage(
    'esbuild',
    ESBUILD_PACKAGE_VERSION,
    {serviceName}
  );

  let jsBundleFile: string;
  let cssBundleFile: string | undefined;
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
      define: definedIdentifiers,
      external: [...external, ...builtInExternal],
      metafile: true,
      loader: {
        '.js': 'ts', // Use TS loader for .js files to enable support for decorators
        '.jsx': 'tsx',
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
              logMessage(`Rebuild succeeded (bundle size: ${bytes(getFileSize(jsBundleFile))})`, {
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

  ({jsBundleFile, cssBundleFile} = determineFileBundlesFromBuildResult(result, {
    serviceDirectory,
    serviceName
  }));

  logMessage(`Build succeeded (bundle size: ${bytes(getFileSize(jsBundleFile))})`, {serviceName});

  return {jsBundleFile, cssBundleFile};
}

function determineFileBundlesFromBuildResult(
  result: BuildResult,
  {serviceDirectory, serviceName}: {serviceDirectory: string; serviceName?: string}
) {
  let jsBundleFile: string | undefined;
  let cssBundleFile: string | undefined;

  const outputs = result?.metafile?.outputs ?? {};

  for (const [file, output] of Object.entries(outputs)) {
    if (output.entryPoint === 'bootstrap.js') {
      jsBundleFile = join(serviceDirectory, file);
    } else if (file.endsWith('.css')) {
      cssBundleFile = join(serviceDirectory, file);
    }
  }

  if (jsBundleFile === undefined) {
    throwError("Couldn't determine the name of generated bundle", {serviceName});
  }

  return {jsBundleFile, cssBundleFile};
}
