import fsExtra from 'fs-extra';
import {join} from 'path';

import {Subservice} from './sub.js';
import {bundle} from '../bundler.js';
import {ProcessController} from '../processes/index.js';
import {AWSFunctionResource} from '../resources/aws/function.js';

const BOOTSTRAP_TEMPLATE_LOCAL = `export {default} from '{{entryPoint}}';`;

const BOOTSTRAP_TEMPLATE_AWS_LAMBDA = `
import {ComponentServer} from '@layr/component-server';
import {createAWSLambdaHandlerForComponentServer} from '@layr/aws-integration';

import componentGetter from '{{entryPoint}}';

export const handler = createAWSLambdaHandlerForComponentServer(async function() {
  return new ComponentServer(await componentGetter());
});
`;

export class BackendService extends Subservice {
  static type = 'backend';

  static help = 'Backend help...';

  getBuildDirectory() {
    const serviceDirectory = this.getDirectory();
    const stage = this.getStage();

    return join(serviceDirectory, 'build', stage);
  }

  // === Commands ===

  static commands = {
    ...Subservice.commands
  };

  async build({watch = false}: {watch?: {afterRebuild?: () => void} | boolean} = {}) {
    await super.build();

    const serviceDirectory = this.getDirectory();
    const serviceName = this.getName();
    const stage = this.getStage();
    const {environment, platform, build: buildConfig} = this.getConfig();

    const buildDirectory = this.getBuildDirectory();

    fsExtra.emptyDirSync(buildDirectory);

    const isLocal = platform === 'local';

    let bundleFileNameWithoutExtension: string;
    let bootstrapTemplate: string;

    if (isLocal) {
      bundleFileNameWithoutExtension = 'bundle';
      bootstrapTemplate = BOOTSTRAP_TEMPLATE_LOCAL;
    } else if (platform === 'aws') {
      bundleFileNameWithoutExtension = 'handler';
      bootstrapTemplate = BOOTSTRAP_TEMPLATE_AWS_LAMBDA;
    } else {
      this.throwError(`Couldn't create a build configuration for the '${platform}' platform`);
    }

    const bundleFile = await bundle({
      serviceDirectory,
      buildDirectory,
      bundleFileNameWithoutExtension,
      bootstrapTemplate,
      serviceName,
      stage,
      environment,
      sourceMap: buildConfig?.sourceMap ?? isLocal,
      minify: buildConfig?.minify ?? !isLocal,
      watch,
      esbuildOptions: {
        target: 'node12',
        platform: 'node',
        mainFields: ['browser', 'module', 'main']
      }
    });

    return bundleFile;
  }

  async start() {
    await super.start();

    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    if (config.platform !== 'local') {
      return;
    }

    if (!config.url) {
      this.throwError(
        `A 'url' property is required in the configuration to start a local server (directory: '${directory}')`
      );
    }

    let url: URL;

    try {
      url = new URL(config.url);
    } catch {
      this.throwError(
        `An error occurred while parsing the 'url' property in the configuration (directory: '${directory}')`
      );
    }

    const {protocol, hostname, port: portString, pathname} = url;

    if (protocol !== 'http:') {
      this.throwError(
        `The 'url' property in the configuration should start with 'http://' (directory: '${directory}')`
      );
    }

    if (hostname !== 'localhost') {
      this.throwError(
        `The host of the 'url' property in the configuration should be 'localhost' (directory: '${directory}')`
      );
    }

    const port = Number(portString);

    if (!port) {
      this.throwError(
        `The 'url' property in the configuration should specify a port (directory: '${directory}')`
      );
    }

    if (pathname !== '/') {
      this.throwError(
        `The path of the 'url' property in the configuration should be '/' (directory: '${directory}')`
      );
    }

    let processController: ProcessController;

    const bundleFile = await this.build({
      watch: {
        afterRebuild() {
          processController.restart();
        }
      }
    });

    processController = new ProcessController(
      'start-backend',
      ['--componentGetterFile', bundleFile, '--port', String(port)],
      {currentDirectory: directory, environment: config.environment, serviceName}
    );

    await processController.start();
  }

  async migrateDatabase(databaseURL: string) {
    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    const bundleFile = await this.build();

    const processController = new ProcessController(
      'migrate-database',
      ['--componentGetterFile', bundleFile, '--databaseURL', databaseURL],
      {currentDirectory: directory, environment: config.environment, serviceName}
    );

    await processController.run();
  }

  async deploy() {
    await super.deploy();

    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    if (config.platform === 'local') {
      this.throwError(`Please specify a non-local stage (example: \`boostr deploy --production\`)`);
    }

    if (!config.url) {
      this.throwError(
        `A 'url' property is required in the configuration to deploy a backend (directory: '${directory}')`
      );
    }

    let url: URL;

    try {
      url = new URL(config.url);
    } catch {
      this.throwError(
        `An error occurred while parsing the 'url' property in the configuration (directory: '${directory}')`
      );
    }

    const {protocol, hostname, port: portString, pathname} = url;

    if (protocol !== 'https:') {
      this.throwError(
        `The 'url' property in the configuration should start with 'https://' (directory: '${directory}')`
      );
    }

    if (hostname === 'localhost') {
      this.throwError(
        `The host of the 'url' property in the configuration should not be 'localhost' (directory: '${directory}')`
      );
    }

    const port = Number(portString);

    if (port) {
      this.throwError(
        `The 'url' property in the configuration should not specify a port (directory: '${directory}')`
      );
    }

    if (pathname !== '/') {
      this.throwError(
        `The path of the 'url' property in the configuration should be '/' (directory: '${directory}')`
      );
    }

    await this.build();

    const buildDirectory = this.getBuildDirectory();

    const resource = new AWSFunctionResource(
      {
        domainName: hostname,
        region: config.aws?.region,
        profile: config.aws?.profile,
        accessKeyId: config.aws?.accessKeyId,
        secretAccessKey: config.aws?.secretAccessKey,
        buildDirectory,
        environment: config.environment,
        lambda: {
          runtime: config.aws?.lambda?.runtime,
          memorySize: config.aws?.lambda?.memorySize,
          timeout: config.aws?.lambda?.timeout,
          reservedConcurrentExecutions: config.aws?.lambda?.reservedConcurrentExecutions
        }
      },
      {serviceName}
    );

    await resource.deploy();
  }
}
