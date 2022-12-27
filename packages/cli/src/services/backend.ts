import fsExtra from 'fs-extra';
import {join, resolve} from 'path';
import {temporaryFileTask} from 'tempy';

import {Subservice} from './sub.js';
import type {Command} from '../command.js';
import {check} from '../checker.js';
import {build} from '../builder.js';
import type {BackgroundMethod} from '../component.js';
import {ProcessController} from '../processes/index.js';
import {AWSFunctionResource, domainNameToLambdaFunctionName} from '../resources/aws/function.js';

const BOOTSTRAP_TEMPLATE_LOCAL = `export {default} from '{{entryPoint}}';`;

const BOOTSTRAP_TEMPLATE_AWS_LAMBDA = `
import {createAWSLambdaHandler, createAWSLambdaExecutionQueueSender} from '@layr/aws-integration';
import {ExecutionQueue} from '@layr/execution-queue';
import AWS from 'aws-sdk';

import componentGetter from '{{entryPoint}}';

export const handler = createAWSLambdaHandler(async function () {
  const rootComponent = await componentGetter();

  const lambdaClient = new AWS.Lambda({apiVersion: '2015-03-31'});

  const executionQueueSender = createAWSLambdaExecutionQueueSender({
    lambdaClient,
    functionName: '{{lambdaFunctionName}}'
  });

  const executionQueue = new ExecutionQueue(executionQueueSender);

  executionQueue.registerRootComponent(rootComponent);

  return rootComponent;
});
`;

export class BackendService extends Subservice {
  static type = 'backend';

  static description =
    'A backend service implementing the data model and the business logic of your app.';

  static examples = [
    'boostr {{serviceName}} start',
    'boostr {{serviceName}} deploy --production',
    'boostr {{serviceName}} exec -- npm install lodash'
  ];

  // === Commands ===

  static commands: Record<string, Command> = {
    ...Subservice.commands,

    introspect: {
      ...Subservice.commands.introspect,
      description: 'Introspects your backend root component and writes the result to a JSON file.',
      examples: ['boostr {{serviceName}} introspect introspection.json'],
      arguments: ['outputFile'],
      async handler(this: BackendService, [outputFile]) {
        await this.introspect(outputFile);
      }
    },

    eval: {
      ...Subservice.commands.eval,
      description:
        'Evaluates the specified JavaScript code with your backend root component exposed globally.',
      examples: ['boostr {{serviceName}} eval "Application.isHealthy()"'],
      arguments: ['codeToEval'],
      async handler(this: BackendService, [code]) {
        await this.eval(code);
      }
    },

    repl: {
      ...Subservice.commands.repl,
      description: 'Starts a Node.js REPL with your backend root component exposed globally.',
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
    const {environment, platform, rootComponent, build: buildConfig = {}, hooks} = this.getConfig();

    if (!rootComponent) {
      this.throwError(
        `A 'rootComponent' property is required in the configuration (directory: '${serviceDirectory}')`
      );
    }

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
      entryPoint: rootComponent,
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
        target: 'node16',
        platform: 'node',
        mainFields: ['module', 'main']
      }
    });

    if (hooks?.afterBuild !== undefined) {
      // TODO: Handle watch mode
      await hooks.afterBuild({
        serviceDirectory,
        serviceName,
        stage,
        platform,
        buildDirectory,
        jsBundleFile
      });
    }

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

    const config = this.getConfig();

    if (!config.url) {
      this.logMessage(
        `The 'url' property is not specified in the configuration. Skipping deployment...`
      );

      return;
    }

    await this.check();

    const backgroundMethods = await this.findBackgroundMethods();

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

    const backgroundMethods = await temporaryFileTask(async (outputFile) => {
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

  async introspect(outputFile: string) {
    outputFile = resolve(process.cwd(), outputFile);

    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    const {jsBundleFile} = await this.build({forceLocal: true});

    const processController = new ProcessController(
      'introspect-backend',
      ['--componentGetterFile', jsBundleFile, '--outputFile', outputFile],
      {currentDirectory: directory, environment: config.environment, serviceName}
    );

    await processController.run();
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
