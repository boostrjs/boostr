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

    const buildDirectory = join(serviceDirectory, 'build', stage);

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

    return {buildDirectory, bundleFile};
  }

  async start() {
    await super.start();

    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    if (config.platform !== 'local') {
      return;
    }

    const {port} = this.parseConfigURL();

    let processController: ProcessController;

    const {bundleFile} = await this.build({
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

    const {bundleFile} = await this.build();

    const processController = new ProcessController(
      'migrate-database',
      ['--componentGetterFile', bundleFile, '--databaseURL', databaseURL],
      {currentDirectory: directory, environment: config.environment, serviceName}
    );

    await processController.run();
  }

  async deploy({skipServiceNames = []}: {skipServiceNames?: string[]} = {}) {
    await super.deploy({skipServiceNames});

    const serviceName = this.getName();

    if (skipServiceNames.includes(serviceName)) {
      return;
    }

    const config = this.getConfig();

    const {hostname} = this.parseConfigURL();

    const {buildDirectory} = await this.build();

    const resource = new AWSFunctionResource(
      {
        domainName: hostname,
        region: config.aws?.region,
        profile: config.aws?.profile,
        accessKeyId: config.aws?.accessKeyId,
        secretAccessKey: config.aws?.secretAccessKey,
        directory: buildDirectory,
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
