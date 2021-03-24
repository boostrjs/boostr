import type {build as buildFunction, BuildOptions, BuildResult} from 'esbuild';
import {join} from 'path';
import bytes from 'bytes';

import {loadNPMPackage, requireGlobalPackage} from './npm.js';
import {logMessage, logError, throwError, resolveVariables, getFileSize} from './util.js';

export async function bundle({
  serviceDirectory,
  buildDirectory,
  bootstrapTemplate,
  serviceName,
  stage,
  environment = {},
  sourceMap = false,
  minify = false,
  freeze = false,
  watch = false,
  esbuildOptions
}: {
  serviceDirectory: string;
  buildDirectory: string;
  bootstrapTemplate: string;
  serviceName?: string;
  stage: string;
  environment?: Record<string, string>;
  sourceMap?: boolean;
  minify?: boolean;
  freeze?: boolean;
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

  const definedIdentifers: Record<string, string> = {'process.env.NODE_ENV': `"${stage}"`};

  for (const [name, value] of Object.entries(environment)) {
    definedIdentifers[`process.env.${name}`] = `"${value}"`;
  }

  const {build}: {build: typeof buildFunction} = await requireGlobalPackage('esbuild', '0.9.6', {
    serviceName
  });

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
      bundle: true,
      entryNames: freeze ? 'bundle-[hash].immutable' : 'bundle',
      assetNames: freeze ? '[name]-[hash].immutable' : '[name]',
      define: definedIdentifers,
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
