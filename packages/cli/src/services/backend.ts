import fsExtra from 'fs-extra';
import {join} from 'path';
import tempy from 'tempy';

import {Subservice} from './sub.js';
import type {Command} from '../command.js';
import {check} from '../checker.js';
import {build} from '../builder.js';
import type {BackgroundMethod} from '../component.js';
import {ProcessController} from '../processes/index.js';
import {AWSFunctionResource, domainNameToLambdaFunctionName} from '../resources/aws/function.js';

const BOOTSTRAP_TEMPLATE_LOCAL = `export {default} from '{{entryPoint}}';`;

const BOOTSTRAP_TEMPLATE_AWS_LAMBDA = `
import {createAWSLambdaHandler, ComponentAWSLambdaClient} from '@layr/aws-integration';
import {ExecutionQueue} from '@layr/execution-queue';

import componentGetter from '{{entryPoint}}';

export const handler = createAWSLambdaHandler(async function() {
  const rootComponent = await componentGetter();

  const componentClient = new ComponentAWSLambdaClient('{{lambdaFunctionName}}');

  const executionQueue = new ExecutionQueue(componentClient);

  executionQueue.registerRootComponent(rootComponent);

  return rootComponent;
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
    ...Subservice.commands,

    eval: {
      ...Subservice.commands.eval,
      description:
        'Evaluate the specified JavaScript code with the root component exposed globally.',
      examples: ['boostr {{serviceName}} eval Application.checkHealth()'],
      minimumArguments: 1,
      maximumArguments: 1,
      async handler(this: BackendService, [code]) {
        await this.eval(code);
      }
    },

    repl: {
      ...Subservice.commands.repl,
      description: 'Start a REPL with the root component exposed globally.',
      examples: ['boostr {{serviceName}} repl'],
      async handler(this: BackendService) {
        await this.startREPL();
      }
    }
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
    let bootstrapVariables: Record<string, string>;
    let builtInExternal: string[] | undefined;

    if (isLocal) {
      bundleFileNameWithoutExtension = 'bundle';
      bootstrapTemplate = BOOTSTRAP_TEMPLATE_LOCAL;
      bootstrapVariables = {};
      builtInExternal = undefined;
    } else if (platform === 'aws') {
      bundleFileNameWithoutExtension = 'handler';
      bootstrapTemplate = BOOTSTRAP_TEMPLATE_AWS_LAMBDA;
      const {hostname} = this.parseConfigURL();
      bootstrapVariables = {lambdaFunctionName: domainNameToLambdaFunctionName(hostname)};
      builtInExternal = ['aws-sdk'];
    } else {
      this.throwError(`Couldn't create a build configuration for the '${platform}' platform`);
    }

    const {jsBundleFile} = await build({
      serviceDirectory,
      buildDirectory,
      bundleFileNameWithoutExtension,
      bootstrapTemplate,
      bootstrapVariables,
      serviceName,
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

    return {buildDirectory, jsBundleFile};
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

    const {jsBundleFile} = await this.build({
      watch: {
        afterRebuild() {
          processController.restart();
        }
      }
    });

    processController = new ProcessController(
      'start-backend',
      ['--componentGetterFile', jsBundleFile, '--port', String(port)],
      {currentDirectory: directory, environment: config.environment, serviceName}
    );

    await processController.start();
  }

  async migrateDatabase(databaseURL: string) {
    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    const {jsBundleFile} = await this.build({forceLocal: true});

    const processController = new ProcessController(
      'migrate-database',
      ['--componentGetterFile', jsBundleFile, '--databaseURL', databaseURL],
      {currentDirectory: directory, environment: config.environment, serviceName}
    );

    await processController.run();
  }

  async importDatabase(databaseURL: string, inputFile: string) {
    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    const {jsBundleFile} = await this.build({forceLocal: true});

    const processController = new ProcessController(
      'import-database',
      [
        '--componentGetterFile',
        jsBundleFile,
        '--databaseURL',
        databaseURL,
        '--inputFile',
        inputFile
      ],
      {currentDirectory: directory, environment: config.environment, serviceName}
    );

    await processController.run();
  }

  async exportDatabase(databaseURL: string, outputFile: string) {
    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    const {jsBundleFile} = await this.build({forceLocal: true});

    const processController = new ProcessController(
      'export-database',
      [
        '--componentGetterFile',
        jsBundleFile,
        '--databaseURL',
        databaseURL,
        '--outputFile',
        outputFile
      ],
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

    const backgroundMethods = await this.findBackgroundMethods();

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
        backgroundMethods,
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

  async findBackgroundMethods() {
    this.logMessage('Searching for background methods...');

    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    await this.startDependencies();

    const {jsBundleFile} = await this.build({forceLocal: true});

    const backgroundMethods = await tempy.file.task(async (outputFile) => {
      const processController = new ProcessController(
        'find-backend-background-methods',
        [
          '--componentGetterFile',
          jsBundleFile,
          '--serviceName',
          serviceName,
          '--outputFile',
          outputFile
        ],
        {
          currentDirectory: directory,
          environment: config.environment,
          serviceName,
          nodeArguments: ['--experimental-repl-await']
        }
      );

      await processController.run();

      return fsExtra.readJSONSync(outputFile) as BackgroundMethod[];
    });

    await this.stopDependencies();

    this.logMessage(`${backgroundMethods.length} background method(s) found`);

    return backgroundMethods;
  }

  async eval(code: string) {
    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    await this.startDependencies();

    const {jsBundleFile} = await this.build({forceLocal: true});

    const processController = new ProcessController(
      'eval-backend',
      ['--componentGetterFile', jsBundleFile, '--serviceName', serviceName, '--code', code],
      {
        currentDirectory: directory,
        environment: config.environment,
        serviceName,
        nodeArguments: ['--experimental-repl-await']
      }
    );

    await processController.run();

    await this.stopDependencies();
  }

  async startREPL() {
    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    await this.startDependencies();

    const {jsBundleFile} = await this.build({forceLocal: true});

    const processController = new ProcessController(
      'start-backend-repl',
      ['--componentGetterFile', jsBundleFile, '--serviceName', serviceName],
      {
        currentDirectory: directory,
        environment: config.environment,
        serviceName,
        nodeArguments: ['--experimental-repl-await'],
        decorateOutput: false
      }
    );

    await processController.run();

    await this.stopDependencies();
  }
}
