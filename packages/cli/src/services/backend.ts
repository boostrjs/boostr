import fsExtra from 'fs-extra';
import {join} from 'path';

import {Subservice} from './sub.js';
import type {Command} from '../command.js';
import {check} from '../checker.js';
import {build} from '../builder.js';
import {ProcessController} from '../processes/index.js';
import {AWSFunctionResource} from '../resources/aws/function.js';

const BOOTSTRAP_TEMPLATE_LOCAL = `export {default} from '{{entryPoint}}';`;

const BOOTSTRAP_TEMPLATE_AWS_LAMBDA = `
import {ComponentServer} from '@layr/component-server';
import {createAWSLambdaHandler} from '@layr/aws-integration';

import componentGetter from '{{entryPoint}}';

export const handler = createAWSLambdaHandler(async function() {
  return await componentGetter();
});
`;

export class BackendService extends Subservice {
  static type = 'backend';

  static description =
    'A backend service implementing the data model and the business logic of your application.';

  static examples = [
    'boostr {{serviceName}} start',
    'boostr {{serviceName}} deploy --production',
    'boostr {{serviceName}} npm install lodash'
  ];

  // === Commands ===

  static commands: Record<string, Command> = {
    ...Subservice.commands
  };

  async check() {
    await super.check();

    const serviceDirectory = this.getDirectory();
    const serviceName = this.getName();

    await check({serviceDirectory, serviceName});
  }

  async build({
    watch = false,
    forceLocal = false
  }: {watch?: {afterRebuild?: () => void} | boolean; forceLocal?: boolean} = {}) {
    await super.build();

    const serviceDirectory = this.getDirectory();
    const serviceName = this.getName();
    const stage = this.getStage();
    const {environment, platform, build: buildConfig = {}} = this.getConfig();

    const buildDirectory = join(serviceDirectory, 'build', stage);

    fsExtra.emptyDirSync(buildDirectory);

    const isLocal = platform === 'local' || forceLocal;

    let bundleFileNameWithoutExtension: string;
    let bootstrapTemplate: string;
    let builtInExternal: string[] | undefined;

    if (isLocal) {
      bundleFileNameWithoutExtension = 'bundle';
      bootstrapTemplate = BOOTSTRAP_TEMPLATE_LOCAL;
      builtInExternal = undefined;
    } else if (platform === 'aws') {
      bundleFileNameWithoutExtension = 'handler';
      bootstrapTemplate = BOOTSTRAP_TEMPLATE_AWS_LAMBDA;
      builtInExternal = ['aws-sdk'];
    } else {
      this.throwError(`Couldn't create a build configuration for the '${platform}' platform`);
    }

    const bundleFile = await build({
      serviceDirectory,
      buildDirectory,
      bundleFileNameWithoutExtension,
      bootstrapTemplate,
      serviceName,
      stage,
      environment,
      external: buildConfig.external,
      builtInExternal,
      sourceMap: buildConfig.sourceMap ?? isLocal,
      minify: buildConfig.minify ?? !isLocal,
      installExternalDependencies: !isLocal,
      watch,
      esbuildOptions: {
        target: 'node12',
        platform: 'node',
        mainFields: ['module', 'main']
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

    const {bundleFile} = await this.build({forceLocal: true});

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

    await this.check();

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
          executionRole: config.aws?.lambda?.executionRole,
          memorySize: config.aws?.lambda?.memorySize,
          timeout: config.aws?.lambda?.timeout,
          reservedConcurrentExecutions: config.aws?.lambda?.reservedConcurrentExecutions
        }
      },
      {serviceName}
    );

    await resource.initialize();

    await resource.deploy();
  }
}
