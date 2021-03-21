import esbuild, {BuildOptions, BuildResult} from 'esbuild';
import {join} from 'path';
import bytes from 'bytes';

import {loadNPMPackage} from './npm.js';
import {logMessage, logError, throwError, resolveVariables, getFileSize} from './util.js';

export async function bundle({
  rootDirectory,
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
  rootDirectory: string;
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

  const pkg = loadNPMPackage(rootDirectory);

  const entryPoint = pkg.main;

  if (entryPoint === undefined) {
    throwError(
      `A 'main' property is missing in a 'package.json' file (directory: '${rootDirectory}')`,
      {serviceName}
    );
  }

  const bootstrapCode = resolveVariables(bootstrapTemplate, {entryPoint});

  const definedIdentifers: Record<string, string> = {'process.env.NODE_ENV': `"${stage}"`};

  for (const [name, value] of Object.entries(environment)) {
    definedIdentifers[`process.env.${name}`] = `"${value}"`;
  }

  let bundleFile: string;
  let result: BuildResult;

  try {
    result = await esbuild.build({
      absWorkingDir: rootDirectory,
      outdir: buildDirectory,
      stdin: {
        contents: bootstrapCode,
        resolveDir: rootDirectory,
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

  bundleFile = determineBundleFileFromBuildResult(result, {rootDirectory, serviceName});

  logMessage(`Build succeeded (bundle size: ${bytes(getFileSize(bundleFile))})`, {serviceName});

  return bundleFile;
}

function determineBundleFileFromBuildResult(
  result: BuildResult,
  {rootDirectory, serviceName}: {rootDirectory: string; serviceName?: string}
) {
  let bundleFile: string | undefined;

  const outputs = result?.metafile?.outputs ?? {};

  for (const [file, output] of Object.entries(outputs)) {
    if (output.entryPoint === 'bootstrap.js') {
      bundleFile = join(rootDirectory, file);
    }
  }

  if (bundleFile === undefined) {
    throwError("Couldn't determine the name of generated bundle", {serviceName});
  }

  return bundleFile;
}
