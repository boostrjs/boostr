import esbuild, {BuildOptions} from 'esbuild';
import {join} from 'path';
import bytes from 'bytes';

import {loadNPMPackage} from './npm.js';
import {logMessage, logError, throwError, resolveVariables, getFileSize} from './util.js';

export async function bundle({
  directory,
  serviceName,
  stage,
  environment = {},
  bootstrapTemplate,
  bundleFileName,
  sourceMap = false,
  minify = false,
  watch = false,
  esbuildOptions
}: {
  directory: string;
  serviceName?: string;
  stage: string;
  environment?: Record<string, string>;
  bootstrapTemplate?: string;
  bundleFileName: string;
  sourceMap?: boolean;
  minify?: boolean;
  watch?: {afterRebuild?: () => void} | boolean;
  esbuildOptions?: BuildOptions;
}) {
  const pkg = loadNPMPackage(directory);

  const entryPoint = pkg.main;

  if (entryPoint === undefined) {
    throwError(
      `A 'main' property is missing in a 'package.json' file (directory: '${directory}')`,
      {serviceName}
    );
  }

  let bootstrapCode: string | undefined;

  if (bootstrapTemplate !== undefined) {
    bootstrapCode = resolveVariables(bootstrapTemplate, {entryPoint});
  }

  const bundleFile = join(directory, 'build', stage, bundleFileName);

  const definedIdentifers: Record<string, string> = {'process.env.NODE_ENV': `"${stage}"`};

  for (const [name, value] of Object.entries(environment)) {
    definedIdentifers[`process.env.${name}`] = `"${value}"`;
  }

  try {
    await esbuild.build({
      absWorkingDir: directory,
      ...(bootstrapCode !== undefined
        ? {
            stdin: {
              contents: bootstrapCode,
              resolveDir: directory,
              sourcefile: 'bootstrap.js'
            }
          }
        : {entryPoints: [entryPoint]}),
      outfile: bundleFile,
      bundle: true,
      define: definedIdentifers,
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

  logMessage(`Build succeeded (bundle size: ${bytes(getFileSize(bundleFile))})`, {serviceName});

  return bundleFile;
}
