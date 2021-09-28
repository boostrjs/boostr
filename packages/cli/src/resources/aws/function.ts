import {promises as fsAsync} from 'fs';
import fsExtra from 'fs-extra';
import {join, sep} from 'path';
import tempy from 'tempy';
// @ts-ignore
import zip from 'cross-zip';
import hasha from 'hasha';
import {sleep, SECOND, MINUTE, HOUR, DAY} from '@layr/utilities';
import isEqual from 'lodash/isEqual.js';
import pull from 'lodash/pull.js';
import bytes from 'bytes';

import {AWSBaseResource, AWSBaseResourceConfig} from './base.js';
import {ResourceOptions} from '../base.js';
import {BackgroundMethod} from '../../component.js';
import {ensureMaximumStringLength} from '../../utilities.js';

const DEFAULT_LAMBDA_RUNTIME = 'nodejs14.x';
const DEFAULT_LAMBDA_EXECUTION_ROLE = 'boostr-backend-lambda-role-v2';
const DEFAULT_LAMBDA_MEMORY_SIZE = 128;
const DEFAULT_LAMBDA_TIMEOUT = 10;

const DEFAULT_API_GATEWAY_CORS_CONFIGURATION = {
  AllowOrigins: ['*'],
  AllowHeaders: ['content-type'],
  AllowMethods: ['GET', 'POST', 'OPTIONS'],
  ExposeHeaders: ['*'],
  MaxAge: 3600 // 1 hour
};

const DEFAULT_IAM_LAMBDA_POLICY_NAME = 'basic-lambda-policy';

const DEFAULT_IAM_LAMBDA_ASSUME_ROLE_POLICY_DOCUMENT = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: {
        Service: 'lambda.amazonaws.com'
      },
      Action: 'sts:AssumeRole'
    }
  ]
};

const DEFAULT_IAM_LAMBDA_POLICY_DOCUMENT = {
  Version: '2012-10-17',
  Statement: [
    {
      Action: ['logs:*', 'lambda:InvokeFunction'],
      Effect: 'Allow',
      Resource: '*'
    }
  ]
};

export type AWSFunctionResourceConfig = AWSBaseResourceConfig & {
  directory: string;
  environment?: Environment;
  backgroundMethods?: BackgroundMethod[];
  lambda?: {
    runtime?: string;
    executionRole?: string;
    memorySize?: number;
    timeout?: number;
    reservedConcurrentExecutions?: number;
  };
};

export type Environment = Record<string, string>;

export type Tags = Record<string, string>;

export class AWSFunctionResource extends AWSBaseResource {
  ['constructor']!: typeof AWSFunctionResource;

  constructor(config: AWSFunctionResourceConfig, options: ResourceOptions = {}) {
    super(config, options);
  }

  _config!: ReturnType<AWSFunctionResource['normalizeConfig']>;

  normalizeConfig(config: AWSFunctionResourceConfig) {
    let {
      directory,
      environment = {},
      backgroundMethods = [],
      lambda: {
        runtime = DEFAULT_LAMBDA_RUNTIME,
        executionRole = DEFAULT_LAMBDA_EXECUTION_ROLE,
        memorySize = DEFAULT_LAMBDA_MEMORY_SIZE,
        timeout,
        reservedConcurrentExecutions
      } = {},
      ...otherAttributes
    } = config;

    if (!directory) {
      this.throwError(`A 'directory' property is required in the configuration`);
    }

    let longestBackgroundMethod: BackgroundMethod | undefined;

    for (const backgroundMethod of backgroundMethods) {
      if (backgroundMethod.maximumDuration === undefined) {
        continue;
      }

      if (longestBackgroundMethod === undefined) {
        longestBackgroundMethod = backgroundMethod;
        continue;
      }

      if (backgroundMethod.maximumDuration > longestBackgroundMethod.maximumDuration!) {
        longestBackgroundMethod = backgroundMethod;
      }
    }

    if (longestBackgroundMethod !== undefined) {
      const maximumTimeout = longestBackgroundMethod.maximumDuration! / SECOND;

      if (timeout === undefined) {
        timeout = maximumTimeout;
      } else if (timeout < maximumTimeout) {
        this.throwError(
          `The Lambda function timeout specified in the configuration (${timeout} seconds) shouldn't be lower than the maximum background method duration (method: '${longestBackgroundMethod.path}', maximum duration: ${maximumTimeout} seconds)`
        );
      }
    } else {
      timeout ??= DEFAULT_LAMBDA_TIMEOUT;
    }

    return {
      ...super.normalizeConfig(otherAttributes),
      directory,
      environment,
      backgroundMethods,
      lambda: {
        runtime,
        executionRole,
        memorySize,
        timeout,
        reservedConcurrentExecutions
      }
    };
  }

  async deploy() {
    const config = this.getConfig();

    this.logMessage(`Starting the deployment of a function to AWS...`);

    await this.getRoute53HostedZone();
    await this.ensureIAMLambdaRole();
    await this.createOrUpdateLambdaFunction();
    await this.configureEventBridgeRules();
    await this.ensureACMCertificate();
    await this.createOrUpdateAPIGateway();
    await this.createOrUpdateAPIGatewayCustomDomainName();

    this.logMessage(`Deployment completed`);
    this.logMessage(`The service should be available at https://${config.domainName}`);
  }

  // === Lambda ===

  async createOrUpdateLambdaFunction() {
    this.logMessage('Checking the Lambda function...');

    const lambdaFunction = await this.getLambdaFunction({throwIfMissing: false});

    if (lambdaFunction === undefined) {
      await this.createLambdaFunction();
      await this.setLambdaFunctionTags();
      return;
    }

    await this.checkLambdaFunctionTags();

    if (await this.checkIfLambdaFunctionCodeHasChanged()) {
      await this.updateLambdaFunctionCode();
    } else {
      this.logMessage(`The Lambda function code was unchanged`);
    }

    if (await this.checkIfLambdaFunctionConfigurationHasChanged()) {
      await this.updateLambdaFunctionConfiguration();
    }

    if (await this.checkIfLambdaFunctionConcurrencyHasChanged()) {
      await this.updateLambdaFunctionConcurrency();
    }
  }

  _lambdaFunction?: {
    arn: string;
    executionRole?: string;
    runtime?: string;
    memorySize?: number;
    timeout?: number;
    reservedConcurrentExecutions?: number;
    environment?: Environment;
    codeSHA256?: string;
    tags?: Tags;
  };

  async getLambdaFunction({throwIfMissing = true} = {}) {
    if (this._lambdaFunction === undefined) {
      const lambda = this.getLambdaClient();

      try {
        const result = await lambda
          .getFunction({
            FunctionName: this.getLambdaName()
          })
          .promise();

        const config = result.Configuration!;

        this._lambdaFunction = {
          arn: config.FunctionArn!,
          executionRole: config.Role!.split('/')[1],
          runtime: config.Runtime!,
          memorySize: config.MemorySize!,
          timeout: config.Timeout!,
          reservedConcurrentExecutions: result.Concurrency?.ReservedConcurrentExecutions,
          environment: config.Environment?.Variables ?? {},
          codeSHA256: config.CodeSha256!,
          tags: result.Tags!
        };
      } catch (err) {
        if (err.code !== 'ResourceNotFoundException') {
          throw err;
        }
      }
    }

    if (this._lambdaFunction === undefined && throwIfMissing) {
      this.throwError(`Couldn't get the Lambda function`);
    }

    return this._lambdaFunction;
  }

  async createLambdaFunction() {
    const config = this.getConfig();
    const lambda = this.getLambdaClient();
    const role = (await this.getIAMLambdaRole())!;
    const zipArchive = await this.getZipArchive();

    this.logMessage(`Creating the Lambda function (${bytes(zipArchive.length)})...`);

    let errors = 0;

    while (this._lambdaFunction === undefined) {
      try {
        const lambdaFunction = await lambda
          .createFunction({
            FunctionName: this.getLambdaName(),
            Handler: 'handler.handler',
            Runtime: config.lambda.runtime,
            Role: role.arn,
            MemorySize: config.lambda.memorySize,
            Timeout: config.lambda.timeout,
            Environment: {Variables: config.environment},
            Code: {ZipFile: zipArchive}
          })
          .promise();

        this._lambdaFunction = {arn: lambdaFunction.FunctionArn!};
      } catch (err) {
        const roleMayNotBeReady = err.code === 'InvalidParameterValueException' && ++errors <= 10;

        if (!roleMayNotBeReady) {
          throw err;
        }

        await sleep(3000);
      }
    }

    if (config.lambda.reservedConcurrentExecutions !== undefined) {
      await this.updateLambdaFunctionConcurrency();
    }
  }

  async checkLambdaFunctionTags() {
    const lambdaFunction = (await this.getLambdaFunction())!;

    if (!this.constructor.managerIdentifiers.includes(lambdaFunction.tags?.['managed-by']!)) {
      this.throwError(
        `Cannot update a Lambda function that was not originally created by this tool (function: '${this.getLambdaName()}')`
      );
    }
  }

  async setLambdaFunctionTags() {
    const lambda = this.getLambdaClient();
    const lambdaFunction = (await this.getLambdaFunction())!;

    await lambda
      .tagResource({
        Resource: lambdaFunction.arn,
        Tags: {'managed-by': this.constructor.managerIdentifiers[0]}
      })
      .promise();
  }

  async checkIfLambdaFunctionConfigurationHasChanged() {
    const config = this.getConfig();
    const lambdaFunction = (await this.getLambdaFunction())!;

    if (lambdaFunction.runtime !== config.lambda.runtime) {
      return true;
    }
    if (lambdaFunction.executionRole !== config.lambda.executionRole) {
      return true;
    }

    if (lambdaFunction.memorySize !== config.lambda.memorySize) {
      return true;
    }

    if (lambdaFunction.timeout !== config.lambda.timeout) {
      return true;
    }

    if (!isEqual(lambdaFunction.environment, config.environment)) {
      return true;
    }

    return false;
  }

  async updateLambdaFunctionConfiguration() {
    const config = this.getConfig();
    const lambda = this.getLambdaClient();
    const role = (await this.getIAMLambdaRole())!;

    this.logMessage('Updating the Lambda function configuration...');

    await lambda
      .updateFunctionConfiguration({
        FunctionName: this.getLambdaName(),
        Runtime: config.lambda.runtime,
        Role: role.arn,
        MemorySize: config.lambda.memorySize,
        Timeout: config.lambda.timeout,
        Environment: {Variables: config.environment}
      })
      .promise();
  }

  async checkIfLambdaFunctionConcurrencyHasChanged() {
    const config = this.getConfig();
    const lambdaFunction = (await this.getLambdaFunction())!;

    return (
      lambdaFunction.reservedConcurrentExecutions !== config.lambda.reservedConcurrentExecutions
    );
  }

  async updateLambdaFunctionConcurrency() {
    const config = this.getConfig();
    const lambda = this.getLambdaClient();

    this.logMessage('Updating the Lambda function concurrency...');

    if (config.lambda.reservedConcurrentExecutions === undefined) {
      await lambda.deleteFunctionConcurrency({FunctionName: this.getLambdaName()}).promise();
    } else {
      await lambda
        .putFunctionConcurrency({
          FunctionName: this.getLambdaName(),
          ReservedConcurrentExecutions: config.lambda.reservedConcurrentExecutions
        })
        .promise();
    }
  }

  async checkIfLambdaFunctionCodeHasChanged() {
    const lambdaFunction = (await this.getLambdaFunction())!;
    const zipArchive = await this.getZipArchive();
    const zipArchiveSHA256 = hasha(zipArchive, {encoding: 'base64', algorithm: 'sha256'});

    return lambdaFunction.codeSHA256 !== zipArchiveSHA256;
  }

  async updateLambdaFunctionCode() {
    const lambda = this.getLambdaClient();
    const zipArchive = await this.getZipArchive();

    this.logMessage(`Updating the Lambda function code (${bytes(zipArchive.length)})...`);

    await lambda
      .updateFunctionCode({
        FunctionName: this.getLambdaName(),
        ZipFile: zipArchive
      })
      .promise();
  }

  _zipArchive!: Buffer;

  async getZipArchive() {
    if (this._zipArchive === undefined) {
      const config = this.getConfig();

      this.logMessage(`Building the ZIP archive...`);

      await tempy.directory.task(async (temporaryDirectory) => {
        const codeDirectory = join(temporaryDirectory, 'code');
        const zipArchiveFile = join(temporaryDirectory, 'archive.zip');

        await fsExtra.copy(config.directory, codeDirectory);

        await this.resetFileTimes(codeDirectory);
        zip.zipSync(`${codeDirectory}${sep}.`, zipArchiveFile);
        this._zipArchive = await fsAsync.readFile(zipArchiveFile);
      });
    }

    return this._zipArchive;
  }

  async resetFileTimes(directory: string) {
    const fixedDate = new Date(Date.UTC(1984, 0, 24));
    const entries = await fsAsync.readdir(directory, {withFileTypes: true});

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);

      await fsAsync.utimes(entryPath, fixedDate, fixedDate);

      if (entry.isDirectory()) {
        await this.resetFileTimes(entryPath);
      }
    }
  }

  async allowLambdaFunctionInvocationFromAPIGateway() {
    const config = this.getConfig();
    const lambda = this.getLambdaClient();
    const lambdaFunction = (await this.getLambdaFunction())!;
    const apiGateway = (await this.getAPIGateway())!;

    const matches = /arn:aws:.+:.+:(\d+):/.exec(lambdaFunction.arn);
    const accountId = matches?.[1];

    if (!accountId) {
      this.throwError('Unable to find out the AWS account ID');
    }

    const sourceARN = `arn:aws:execute-api:${config.region}:${accountId}:${apiGateway.id}/*/*`;

    await lambda
      .addPermission({
        FunctionName: lambdaFunction.arn,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        StatementId: 'allow_api_gateway',
        SourceArn: sourceARN
      })
      .promise();
  }

  getLambdaName() {
    return domainNameToLambdaFunctionName(this.getConfig().domainName);
  }

  // === EventBridge rules ===

  async configureEventBridgeRules() {
    const config = this.getConfig();

    const expectedRules = config.backgroundMethods
      .filter(({scheduling}) => scheduling)
      .map(({path, scheduling, query}) => ({
        name: ensureMaximumStringLength(`${this.getLambdaName()}.${path}`, 64),
        description: `Invokes the method ${path}() from the Lambda function '${this.getLambdaName()}'.`,
        scheduleExpression: millisecondsToEventBridgeScheduleExpression(
          (scheduling as {rate: number}).rate
        ),
        input: JSON.stringify({query})
      }));

    const existingRules = await this.findEventBridgeExistingRules();

    for (const expectedRule of expectedRules) {
      const existingRule = existingRules.find(
        (existingRule) => existingRule.name === expectedRule.name
      );

      if (existingRule === undefined) {
        await this.createEventBridgeRule(expectedRule);
      } else {
        if (existingRule.scheduleExpression !== expectedRule.scheduleExpression) {
          await this.updateEventBridgeRule({...existingRule, ...expectedRule});
        }

        pull(existingRules, existingRule);
      }
    }

    for (const existingRule of existingRules) {
      await this.removeEventBridgeRule(existingRule);
    }
  }

  async findEventBridgeExistingRules() {
    const eventBridge = this.getEventBridgeClient();

    const lambdaFunction = (await this.getLambdaFunction())!;

    this.logMessage(`Searching for EventBridge existing rules...`);

    const result = await eventBridge
      .listRuleNamesByTarget({TargetArn: lambdaFunction.arn})
      .promise();

    if (result.NextToken) {
      this.throwError(
        `Whoa, you have a lot of EventBridge rules associated to the Lambda function! Unfortunately, this tool cannot list them all.`
      );
    }

    const existingRuleNames = result.RuleNames!;

    const existingRules: {
      name: string;
      description: string;
      arn: string;
      scheduleExpression: string;
    }[] = [];

    for (const name of existingRuleNames) {
      const result = await eventBridge.describeRule({Name: name}).promise();

      existingRules.push({
        name: result.Name!,
        description: result.Description!,
        arn: result.Arn!,
        scheduleExpression: result.ScheduleExpression!
      });
    }

    return existingRules;
  }

  async createEventBridgeRule(rule: {
    name: string;
    description: string;
    scheduleExpression: string;
    input: string;
  }) {
    const lambda = this.getLambdaClient();
    const eventBridge = this.getEventBridgeClient();

    this.logMessage(`Creating the EventBridge rule '${rule.name}'...`);

    const putRuleResult = await eventBridge
      .putRule({
        Name: rule.name,
        Description: rule.description,
        ScheduleExpression: rule.scheduleExpression,
        Tags: [{Key: 'managed-by', Value: this.constructor.managerIdentifiers[0]}]
      })
      .promise();

    await lambda
      .addPermission({
        FunctionName: this.getLambdaName(),
        StatementId: eventBridgeRuleNameToLambdaPermissionStatementId(rule.name),
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
        SourceArn: putRuleResult.RuleArn!
      })
      .promise();

    const lambdaFunction = (await this.getLambdaFunction())!;

    const putTargetsResult = await eventBridge
      .putTargets({
        Rule: rule.name,
        Targets: [{Id: rule.name, Arn: lambdaFunction.arn, Input: rule.input}]
      })
      .promise();

    if (putTargetsResult.FailedEntryCount !== 0) {
      this.throwError(
        `An error occurred while setting the target of the EventBridge rule (code: '${
          putTargetsResult.FailedEntries![0].ErrorCode
        }', message: '${putTargetsResult.FailedEntries![0].ErrorMessage}')`
      );
    }
  }

  async updateEventBridgeRule(rule: {
    name: string;
    description: string;
    scheduleExpression: string;
    arn: string;
  }) {
    const eventBridge = this.getEventBridgeClient();

    if (!(await this.checkEventBridgeRuleTags(rule))) {
      this.throwError(
        `Cannot update an EventBridge rule that was not originally created by this tool (rule: '${rule.name}')`
      );
    }

    this.logMessage(`Updating the EventBridge rule '${rule.name}'...`);

    await eventBridge
      .putRule({
        Name: rule.name,
        Description: rule.description,
        ScheduleExpression: rule.scheduleExpression
      })
      .promise();
  }

  async removeEventBridgeRule(rule: {name: string; arn: string}) {
    const lambda = this.getLambdaClient();
    const eventBridge = this.getEventBridgeClient();

    if (!(await this.checkEventBridgeRuleTags(rule))) {
      return;
    }

    this.logMessage(`Removing the EventBridge rule '${rule.name}'...`);

    const removeTargetsResult = await eventBridge
      .removeTargets({Rule: rule.name, Ids: [rule.name]})
      .promise();

    if (removeTargetsResult.FailedEntryCount !== 0) {
      this.throwError(
        `An error occurred while setting the target of the EventBridge rule (code: '${
          removeTargetsResult.FailedEntries![0].ErrorCode
        }', message: '${removeTargetsResult.FailedEntries![0].ErrorMessage}')`
      );
    }

    await lambda
      .removePermission({
        FunctionName: this.getLambdaName(),
        StatementId: eventBridgeRuleNameToLambdaPermissionStatementId(rule.name)
      })
      .promise();

    await eventBridge.deleteRule({Name: rule.name}).promise();
  }

  async checkEventBridgeRuleTags(rule: {name: string; arn: string}) {
    const tags = await this.getEventBridgeRuleTags(rule);

    return this.constructor.managerIdentifiers.includes(tags['managed-by']);
  }

  async getEventBridgeRuleTags(rule: {arn: string}) {
    const eventBridge = this.getEventBridgeClient();

    const result = await eventBridge.listTagsForResource({ResourceARN: rule.arn}).promise();

    const tags: Record<string, string> = Object.create(null);

    for (const {Key, Value} of result.Tags!) {
      tags[Key] = Value;
    }

    return tags;
  }

  // === IAM for Lambda ===

  async ensureIAMLambdaRole() {
    this.logMessage('Checking the IAM Lambda role...');

    if ((await this.getIAMLambdaRole({throwIfMissing: false})) === undefined) {
      this.logMessage('Creating the IAM Lambda role...');

      await this.createIAMLambdaRole();
    }
  }

  _iamLambdaRole?: {arn: string};

  async getIAMLambdaRole({throwIfMissing = true}: {throwIfMissing?: boolean} = {}) {
    if (this._iamLambdaRole === undefined) {
      const iam = this.getIAMClient();

      try {
        const result = await iam
          .getRole({RoleName: this.getConfig().lambda.executionRole})
          .promise();
        this._iamLambdaRole = {arn: result.Role.Arn};
      } catch (err) {
        if (err.code !== 'NoSuchEntity') {
          throw err;
        }
      }
    }

    if (this._iamLambdaRole === undefined && throwIfMissing) {
      this.throwError(`Couldn't get the IAM Lambda role`);
    }

    return this._iamLambdaRole;
  }

  async createIAMLambdaRole() {
    const iam = this.getIAMClient();

    const assumeRolePolicyDocument = JSON.stringify(
      DEFAULT_IAM_LAMBDA_ASSUME_ROLE_POLICY_DOCUMENT,
      undefined,
      2
    );

    const {
      Role: {Arn: arn}
    } = await iam
      .createRole({
        RoleName: this.getConfig().lambda.executionRole,
        AssumeRolePolicyDocument: assumeRolePolicyDocument
      })
      .promise();

    const policyDocument = JSON.stringify(DEFAULT_IAM_LAMBDA_POLICY_DOCUMENT, undefined, 2);

    await iam
      .putRolePolicy({
        RoleName: this.getConfig().lambda.executionRole,
        PolicyName: DEFAULT_IAM_LAMBDA_POLICY_NAME,
        PolicyDocument: policyDocument
      })
      .promise();

    await sleep(15000); // Wait 15 secs so AWS can replicate the role in all regions

    this._iamLambdaRole = {arn};
  }

  // === API Gateway ===

  async createOrUpdateAPIGateway() {
    this.logMessage(`Checking the API Gateway...`);

    const api = await this.getAPIGateway({throwIfMissing: false});

    if (api === undefined) {
      await this.createAPIGateway();
      await this.allowLambdaFunctionInvocationFromAPIGateway();
    } else {
      await this.checkAPIGatewayTags();
    }
  }

  _apiGateway?: {id: string; endpoint: string; tags: {[name: string]: string}};

  async getAPIGateway({throwIfMissing = true} = {}) {
    if (this._apiGateway === undefined) {
      const apiGateway = this.getAPIGatewayV2Client();

      const result = await apiGateway.getApis().promise();
      const item = result.Items?.find((item) => item.Name === this.getAPIGatewayName());

      if (item !== undefined) {
        this._apiGateway = {id: item.ApiId!, endpoint: item.ApiEndpoint!, tags: item.Tags!};
      } else if (result.NextToken) {
        this.throwError(
          `Whoa, you have a lot of API Gateways! Unfortunately, this tool cannot list them all.`
        );
      }
    }

    if (this._apiGateway === undefined && throwIfMissing) {
      this.throwError(`Couldn't find the API Gateway`);
    }

    return this._apiGateway;
  }

  async createAPIGateway() {
    const apiGateway = this.getAPIGatewayV2Client();

    this.logMessage(`Creating the API Gateway...`);

    const tags = {'managed-by': this.constructor.managerIdentifiers[0]};

    const result = await apiGateway
      .createApi({
        Name: this.getAPIGatewayName(),
        ProtocolType: 'HTTP',
        Target: (await this.getLambdaFunction())!.arn,
        CorsConfiguration: DEFAULT_API_GATEWAY_CORS_CONFIGURATION,
        Tags: tags
      })
      .promise();

    this._apiGateway = {id: result.ApiId!, endpoint: result.ApiEndpoint!, tags};
  }

  async checkAPIGatewayTags() {
    const api = (await this.getAPIGateway())!;

    if (!this.constructor.managerIdentifiers.includes(api.tags['managed-by'])) {
      this.throwError(
        `Cannot use an API Gateway that was not originally created by this tool (name: '${this.getAPIGatewayName()}')`
      );
    }
  }

  async createOrUpdateAPIGatewayCustomDomainName() {
    const config = this.getConfig();

    this.logMessage(`Checking the API Gateway custom domain name...`);

    let customDomainName = await this.getAPIGatewayCustomDomainName({throwIfMissing: false});

    if (customDomainName === undefined) {
      customDomainName = await this.createAPIGatewayCustomDomainName();
    }

    const targetDomainName = customDomainName.apiGatewayDomainName;
    const targetHostedZoneId = customDomainName.hostedZoneId;
    await this.ensureRoute53Alias({name: config.domainName, targetDomainName, targetHostedZoneId});
  }

  _apiGatewayCustomDomainName?: {
    domainName: string;
    apiGatewayDomainName: string;
    hostedZoneId: string;
  };

  async getAPIGatewayCustomDomainName({throwIfMissing = true} = {}) {
    if (!this._apiGatewayCustomDomainName) {
      const config = this.getConfig();
      const apiGateway = this.getAPIGatewayV2Client();

      let result;

      try {
        result = await apiGateway
          .getDomainName({
            DomainName: config.domainName
          })
          .promise();
      } catch (err) {
        if (err.code !== 'NotFoundException') {
          throw err;
        }
      }

      if (result !== undefined) {
        this._apiGatewayCustomDomainName = {
          domainName: result.DomainName!,
          apiGatewayDomainName: result.DomainNameConfigurations![0].ApiGatewayDomainName!,
          hostedZoneId: result.DomainNameConfigurations![0].HostedZoneId!
        };
      }
    }

    if (this._apiGatewayCustomDomainName === undefined && throwIfMissing) {
      this.throwError('API Gateway custom domain name not found');
    }

    return this._apiGatewayCustomDomainName;
  }

  async createAPIGatewayCustomDomainName() {
    const config = this.getConfig();
    const apiGateway = this.getAPIGatewayV2Client();

    this.logMessage(`Creating the API Gateway custom domain name...`);

    const api = (await this.getAPIGateway())!;
    const certificate = (await this.getACMCertificate())!;

    const result = await apiGateway
      .createDomainName({
        DomainName: config.domainName,
        DomainNameConfigurations: [
          {
            ApiGatewayDomainName: api.endpoint,
            CertificateArn: certificate.arn,
            EndpointType: 'REGIONAL',
            SecurityPolicy: 'TLS_1_2'
          }
        ]
      })
      .promise();

    await apiGateway
      .createApiMapping({ApiId: api.id, DomainName: config.domainName, Stage: '$default'})
      .promise();

    this._apiGatewayCustomDomainName = {
      domainName: result.DomainName!,
      apiGatewayDomainName: result.DomainNameConfigurations![0].ApiGatewayDomainName!,
      hostedZoneId: result.DomainNameConfigurations![0].HostedZoneId!
    };

    return this._apiGatewayCustomDomainName;
  }

  getAPIGatewayName() {
    return this.getConfig().domainName;
  }
}

function millisecondsToEventBridgeScheduleExpression(milliseconds: number) {
  let value: number;
  let unit: string;

  if (milliseconds > 0 && milliseconds % DAY === 0) {
    value = milliseconds / DAY;
    unit = 'day';
  } else if (milliseconds > 0 && milliseconds % HOUR === 0) {
    value = milliseconds / HOUR;
    unit = 'hour';
  } else if (milliseconds > 0 && milliseconds % MINUTE === 0) {
    value = milliseconds / MINUTE;
    unit = 'minute';
  } else {
    throw new Error(
      `The specified number of milliseconds (${milliseconds}) cannot be converted to an EventBridge schedule expression`
    );
  }

  if (value > 1) {
    unit += 's';
  }

  return `rate(${value} ${unit})`;
}

export function domainNameToLambdaFunctionName(domainName: string) {
  return ensureMaximumStringLength(domainName.replace(/\./g, '-'), 64);
}

function eventBridgeRuleNameToLambdaPermissionStatementId(name: string) {
  return name.replace(/\./g, '-');
}
