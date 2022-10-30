import type AWS from 'aws-sdk';
import pick from 'lodash/pick.js';
import sortBy from 'lodash/sortBy.js';
import isEqual from 'lodash/isEqual.js';
import takeRight from 'lodash/takeRight.js';
import trimEnd from 'lodash/trimEnd.js';
import {sleep} from '@layr/utilities';

import {BaseResource, BaseResourceConfig, ResourceOptions} from '../base.js';
import {requireGlobalNPMPackage} from '../../npm.js';

const AWS_SDK_PACKAGE_VERSION = '2.1243.0';

const DEFAULT_ROUTE_53_TTL = 300;

export type AWSBaseResourceConfig = BaseResourceConfig & {
  region: string;
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

export class AWSBaseResource extends BaseResource {
  ['constructor']!: typeof AWSBaseResource;

  constructor(config: AWSBaseResourceConfig, options: ResourceOptions = {}) {
    super(config, options);
  }

  _config!: ReturnType<AWSBaseResource['normalizeConfig']>;

  normalizeConfig(config: AWSBaseResourceConfig) {
    const {region, profile, accessKeyId, secretAccessKey, ...otherAttributes} = config;

    if (!region) {
      this.throwError(`A 'region' property is required in the configuration`);
    }

    return {
      ...super.normalizeConfig(otherAttributes),
      region,
      profile,
      accessKeyId,
      secretAccessKey
    };
  }

  _AWS!: typeof AWS;

  async initialize() {
    await super.initialize();

    this._AWS = await requireGlobalNPMPackage('aws-sdk', AWS_SDK_PACKAGE_VERSION, {
      serviceName: this.getServiceName()
    });
  }

  // === IAM ===

  _iamClient!: AWS.IAM;

  getIAMClient() {
    if (this._iamClient === undefined) {
      this._iamClient = new this._AWS.IAM({...this.buildAWSConfig(), apiVersion: '2010-05-08'});
    }

    return this._iamClient;
  }

  // === Lambda ===

  _lambdaClient!: AWS.Lambda;

  getLambdaClient() {
    if (this._lambdaClient === undefined) {
      this._lambdaClient = new this._AWS.Lambda({
        ...this.buildAWSConfig(),
        apiVersion: '2015-03-31'
      });
    }

    return this._lambdaClient;
  }

  // === EventBridge ===

  _eventBridgeClient!: AWS.EventBridge;

  getEventBridgeClient() {
    if (this._eventBridgeClient === undefined) {
      this._eventBridgeClient = new this._AWS.EventBridge({
        ...this.buildAWSConfig(),
        apiVersion: '2015-10-07'
      });
    }

    return this._eventBridgeClient;
  }

  // === S3 ===

  _s3Client!: AWS.S3;

  getS3Client() {
    if (this._s3Client === undefined) {
      this._s3Client = new this._AWS.S3({...this.buildAWSConfig(), apiVersion: '2006-03-01'});
    }

    return this._s3Client;
  }

  // === API Gateway v2 ===

  _apiGatewayV2Client!: AWS.ApiGatewayV2;

  getAPIGatewayV2Client() {
    if (this._apiGatewayV2Client === undefined) {
      this._apiGatewayV2Client = new this._AWS.ApiGatewayV2({
        ...this.buildAWSConfig(),
        apiVersion: '2018-11-29'
      });
    }

    return this._apiGatewayV2Client;
  }

  // === CloudFront ===

  _cloudFrontClient!: AWS.CloudFront;

  getCloudFrontClient() {
    if (this._cloudFrontClient === undefined) {
      this._cloudFrontClient = new this._AWS.CloudFront({
        ...this.buildAWSConfig(),
        apiVersion: '2019-03-26'
      });
    }

    return this._cloudFrontClient;
  }

  // === Route 53 ===

  _route53HostedZone?: {id: string};

  async getRoute53HostedZone({throwIfMissing = true} = {}) {
    if (this._route53HostedZone === undefined) {
      const hostedZone = await this.findRoute53HostedZone(this.getConfig().domainName);

      if (hostedZone !== undefined) {
        this._route53HostedZone = {id: hostedZone.Id};
      }
    }

    if (this._route53HostedZone === undefined && throwIfMissing) {
      this.throwError(
        `Couldn't get the Route 53 hosted zone. Please make sure your domain name is hosted by Route 53.`
      );
    }

    return this._route53HostedZone;
  }

  async ensureRoute53CNAME({name, value}: {name: string; value: string}) {
    const route53 = this.getRoute53Client();

    this.logMessage(`Checking the Route53 CNAME...`);

    name = trimEnd(name, '.');
    value = trimEnd(value, '.');

    const hostedZone = (await this.getRoute53HostedZone())!;

    const recordSet = await this.findRoute53RecordSet({
      hostedZoneId: hostedZone.id,
      name,
      type: 'CNAME'
    });

    let isMissingOrDifferent = false;

    if (recordSet === undefined) {
      this.logMessage(`Creating the Route53 CNAME...`);
      isMissingOrDifferent = true;
    } else if (recordSet.ResourceRecords?.[0]?.Value !== value) {
      this.logMessage(`Updating the Route53 CNAME...`);
      isMissingOrDifferent = true;
    }

    if (isMissingOrDifferent) {
      const {
        ChangeInfo: {Id: changeId}
      } = await route53
        .changeResourceRecordSets({
          HostedZoneId: hostedZone.id,
          ChangeBatch: {
            Changes: [
              {
                Action: 'UPSERT',
                ResourceRecordSet: {
                  Name: name + '.',
                  Type: 'CNAME',
                  ResourceRecords: [{Value: value}],
                  TTL: DEFAULT_ROUTE_53_TTL
                }
              }
            ]
          }
        })
        .promise();

      await this.waitForRoute53RecordSetChange(changeId);
    }

    return true;
  }

  async ensureRoute53Alias({
    name,
    targetDomainName,
    targetHostedZoneId
  }: {
    name: string;
    targetDomainName: string;
    targetHostedZoneId: string;
  }) {
    const route53 = this.getRoute53Client();

    name = trimEnd(name, '.');
    targetDomainName = trimEnd(targetDomainName, '.');

    this.logMessage(`Checking the Route53 Alias...`);

    const hostedZone = (await this.getRoute53HostedZone())!;

    const recordSet = await this.findRoute53RecordSet({
      hostedZoneId: hostedZone.id,
      name,
      type: 'A'
    });

    let isMissingOrDifferent = false;

    if (recordSet === undefined) {
      this.logMessage(`Creating the Route53 Alias...`);
      isMissingOrDifferent = true;
    } else if (recordSet.AliasTarget?.DNSName !== targetDomainName + '.') {
      this.logMessage(`Updating the Route53 Alias...`);
      isMissingOrDifferent = true;
    }

    if (isMissingOrDifferent) {
      const {
        ChangeInfo: {Id: changeId}
      } = await route53
        .changeResourceRecordSets({
          HostedZoneId: hostedZone.id,
          ChangeBatch: {
            Changes: [
              {
                Action: 'UPSERT',
                ResourceRecordSet: {
                  Name: name + '.',
                  Type: 'A',
                  AliasTarget: {
                    DNSName: targetDomainName + '.',
                    HostedZoneId: targetHostedZoneId,
                    EvaluateTargetHealth: false
                  }
                }
              }
            ]
          }
        })
        .promise();

      await this.waitForRoute53RecordSetChange(changeId);
    }

    return true;
  }

  async findRoute53HostedZone(domainName: string) {
    const route53 = this.getRoute53Client();

    this.logMessage(`Searching for the Route 53 hosted zone...`);

    const dnsName = takeRight(domainName.split('.'), 2).join('.');

    const result = await route53.listHostedZonesByName({DNSName: dnsName}).promise();

    let bestHostedZone: AWS.Route53.HostedZone | undefined;

    for (const hostedZone of result.HostedZones) {
      if (
        domainName + '.' === hostedZone.Name ||
        (domainName + '.').endsWith('.' + hostedZone.Name)
      ) {
        if (bestHostedZone === undefined || hostedZone.Name.length > bestHostedZone.Name.length) {
          bestHostedZone = hostedZone;
        }
      }
    }

    if (bestHostedZone !== undefined) {
      return bestHostedZone;
    }

    if (result.IsTruncated) {
      this.throwError(
        `Whoa, you have a lot of Route 53 hosted zones! Unfortunately, this tool cannot list them all.`
      );
    }

    return undefined;
  }

  async findRoute53RecordSet({
    hostedZoneId,
    name,
    type
  }: {
    hostedZoneId: string;
    name: string;
    type: string;
  }) {
    const route53 = this.getRoute53Client();

    this.logMessage(`Searching for the Route 53 record set...`);

    name += '.';

    const result = await route53
      .listResourceRecordSets({
        HostedZoneId: hostedZoneId,
        StartRecordName: name,
        StartRecordType: type
      })
      .promise();

    const recordSet = result.ResourceRecordSets.find(
      (recordSet) => recordSet.Name === name && recordSet.Type === type
    );

    if (recordSet) {
      return recordSet;
    }

    if (result.IsTruncated) {
      this.throwError(
        `Whoa, you have a lot of Route 53 record sets! Unfortunately, this tool cannot list them all.`
      );
    }

    return undefined;
  }

  async waitForRoute53RecordSetChange(changeId: string) {
    const route53 = this.getRoute53Client();

    this.logMessage(`Waiting for the Route 53 record set change to complete...`);

    let totalSleepTime = 0;
    const maxSleepTime = 3 * 60 * 1000; // 3 minutes
    const sleepTime = 5000; // 5 seconds

    do {
      await sleep(sleepTime);
      totalSleepTime += sleepTime;

      const result = await route53.getChange({Id: changeId}).promise();

      if (result.ChangeInfo.Status !== 'PENDING') {
        return;
      }
    } while (totalSleepTime <= maxSleepTime);

    this.throwError(
      `Route 53 record set change uncompleted after ${totalSleepTime / 1000} seconds`
    );
  }

  _route53Client!: AWS.Route53;

  getRoute53Client() {
    if (this._route53Client === undefined) {
      this._route53Client = new this._AWS.Route53({
        ...this.buildAWSConfig(),
        apiVersion: '2013-04-01'
      });
    }

    return this._route53Client;
  }

  // === ACM ===

  async ensureACMCertificate({region}: {region?: string} = {}) {
    this.logMessage(`Checking the ACM Certificate...`);

    let certificate = await this.getACMCertificate({region, throwIfMissing: false});

    if (certificate === undefined) {
      certificate = await this.createACMCertificate({region});
    }

    return certificate;
  }

  _acmCertificate?: {arn: string};

  async getACMCertificate({
    region,
    throwIfMissing = true
  }: {region?: string; throwIfMissing?: boolean} = {}) {
    if (this._acmCertificate === undefined) {
      const certificate = await this.findACMCertificate(this.getConfig().domainName, {region});

      if (certificate !== undefined) {
        const arn = certificate.CertificateArn!;

        if (certificate.Status === 'PENDING_VALIDATION') {
          await this.waitForACMCertificateValidation(arn, {region});
        }

        this._acmCertificate = {arn};
      }
    }

    if (this._acmCertificate === undefined && throwIfMissing) {
      this.throwError(`Couldn't get the ACM Certificate`);
    }

    return this._acmCertificate;
  }

  async createACMCertificate({region}: {region?: string} = {}) {
    const acm = this.getACMClient({region});

    this.logMessage(`Creating the ACM Certificate...`);

    const result = await acm
      .requestCertificate({
        DomainName: this.getConfig().domainName,
        ValidationMethod: 'DNS',
        Tags: [{Key: 'managed-by', Value: this.constructor.managerIdentifiers[0]}]
      })
      .promise();
    const arn = result.CertificateArn!;

    const validationCNAME = await this.getACMCertificateValidationCNAME(arn, {region});

    await this.ensureRoute53CNAME(validationCNAME);

    await this.waitForACMCertificateValidation(arn, {region});

    this._acmCertificate = {arn};

    return this._acmCertificate;
  }

  async findACMCertificate(domainName: string, {region}: {region?: string}) {
    const acm = this.getACMClient({region});

    let rootDomainName: string | undefined;

    const parts = domainName.split('.');

    if (parts.length > 2) {
      rootDomainName = parts.slice(1).join('.');
    }

    const result = await acm
      .listCertificates({
        CertificateStatuses: ['ISSUED', 'PENDING_VALIDATION'],
        Includes: {
          // We need the following because 'RSA_4096' is not included by default
          keyTypes: [
            'RSA_2048',
            'RSA_1024',
            'RSA_4096',
            'EC_prime256v1',
            'EC_secp384r1',
            'EC_secp521r1'
          ]
        },
        MaxItems: 1000
      })
      .promise();

    const certificates = result.CertificateSummaryList!.filter((certificate) => {
      if (certificate.DomainName === domainName) {
        return true;
      }

      if (rootDomainName !== undefined) {
        if (certificate.DomainName === '*.' + rootDomainName) {
          return true;
        }
      }

      return false;
    });

    let bestCertificates: AWS.ACM.CertificateDetail[] = [];
    const bestCertificatesMatchedName = new Map<AWS.ACM.CertificateDetail, string>();

    for (let certificate of certificates) {
      const result = await acm
        .describeCertificate({CertificateArn: certificate.CertificateArn!})
        .promise();
      const certificateDetail: AWS.ACM.CertificateDetail = result.Certificate!;

      let matchedName;

      for (const name of certificateDetail.SubjectAlternativeNames!) {
        if (
          name === domainName ||
          (rootDomainName !== undefined && name === '*.' + rootDomainName)
        ) {
          if (matchedName === undefined || matchedName.length < name.length) {
            matchedName = name;
          }
        }
      }

      if (matchedName !== undefined) {
        bestCertificatesMatchedName.set(certificateDetail, matchedName);
        bestCertificates.push(certificateDetail);
      }
    }

    bestCertificates = sortBy(
      bestCertificates,
      (certificate) => -bestCertificatesMatchedName.get(certificate)!.length
    );

    for (const certificate of bestCertificates) {
      if (certificate.Status === 'ISSUED') {
        return certificate;
      }
    }

    for (const certificate of bestCertificates) {
      if (certificate.Status === 'PENDING_VALIDATION') {
        const result = await acm
          .listTagsForCertificate({
            CertificateArn: certificate.CertificateArn!
          })
          .promise();
        if (
          result.Tags!.some((tag) =>
            isEqual(tag, {Key: 'managed-by', Value: this.constructor.managerIdentifiers[0]})
          )
        ) {
          return certificate;
        }
      }
    }

    if (result.NextToken) {
      this.throwError(
        `Whoa, you have a lot of ACM Certificates! Unfortunately, this tool cannot list them all.`
      );
    }

    return undefined;
  }

  async getACMCertificateValidationCNAME(arn: string, {region}: {region?: string}) {
    const acm = this.getACMClient({region});

    this.logMessage(`Getting the ACM Certificate DNS Validation record...`);

    let totalSleepTime = 0;
    const maxSleepTime = 60 * 1000; // 1 minute
    const sleepTime = 5 * 1000; // 5 seconds

    do {
      await sleep(sleepTime);
      totalSleepTime += sleepTime;

      const {Certificate: certificate} = await acm
        .describeCertificate({
          CertificateArn: arn
        })
        .promise();
      const record = certificate?.DomainValidationOptions?.[0].ResourceRecord;

      if (record?.Type === 'CNAME') {
        return {name: record.Name, value: record.Value};
      }
    } while (totalSleepTime <= maxSleepTime);

    this.throwError(
      `Couldn't get the ACM Certificate DNS Validation record after ${
        totalSleepTime / 1000
      } seconds`
    );
  }

  async waitForACMCertificateValidation(arn: string, {region}: {region?: string}) {
    const acm = this.getACMClient({region});

    this.logMessage(`Waiting for the ACM Certificate validation...`);

    let totalSleepTime = 0;
    const maxSleepTime = 60 * 60 * 1000; // 1 hour
    const sleepTime = 10000; // 10 seconds

    do {
      await sleep(sleepTime);
      totalSleepTime += sleepTime;

      const result = await acm
        .describeCertificate({
          CertificateArn: arn
        })
        .promise();

      if (result.Certificate?.Status === 'ISSUED') {
        return;
      }
    } while (totalSleepTime <= maxSleepTime);

    this.throwError(
      `ACM Certificate has not been validated after ${totalSleepTime / 1000} seconds`
    );
  }

  _acmClients!: {[regionKey: string]: AWS.ACM};

  getACMClient({region}: {region?: string} = {}) {
    if (this._acmClients === undefined) {
      this._acmClients = {};
    }

    const regionKey = region !== undefined ? region : '$config';

    if (this._acmClients[regionKey] === undefined) {
      this._acmClients[regionKey] = new this._AWS.ACM({
        ...this.buildAWSConfig({region}),
        apiVersion: '2015-12-08'
      });
    }

    return this._acmClients[regionKey];
  }

  // === AWS Config ===

  buildAWSConfig({region}: {region?: string} = {}) {
    const config = this.getConfig();

    let credentials: {accessKeyId?: string; secretAccessKey?: string} = {};

    if (config.profile !== undefined) {
      const profileCredentials = new this._AWS.SharedIniFileCredentials({profile: config.profile});
      credentials = pick(profileCredentials, ['accessKeyId', 'secretAccessKey']);
    }

    if (config.accessKeyId !== undefined) {
      credentials.accessKeyId = config.accessKeyId;
    }

    if (config.secretAccessKey !== undefined) {
      credentials.secretAccessKey = config.secretAccessKey;
    }

    return {
      ...credentials,
      region: region ?? config.region,
      signatureVersion: 'v4'
    };
  }
}

const S3_REGIONS: {[name: string]: {websiteEndpoint: string}} = {
  'us-east-1': {websiteEndpoint: 's3-website-us-east-1.amazonaws.com'},
  'us-east-2': {websiteEndpoint: 's3-website.us-east-2.amazonaws.com'},
  'us-west-1': {websiteEndpoint: 's3-website-us-west-1.amazonaws.com'},
  'us-west-2': {websiteEndpoint: 's3-website-us-west-2.amazonaws.com'},
  'ca-central-1': {websiteEndpoint: 's3-website.ca-central-1.amazonaws.com'},
  'sa-east-1': {websiteEndpoint: 's3-website-sa-east-1.amazonaws.com'},
  'ap-east-1': {websiteEndpoint: 's3-website.ap-east-1.amazonaws.com'},
  'ap-south-1': {websiteEndpoint: 's3-website.ap-south-1.amazonaws.com'},
  'ap-northeast-1': {websiteEndpoint: 's3-website-ap-northeast-1.amazonaws.com'},
  'ap-northeast-2': {websiteEndpoint: 's3-website.ap-northeast-2.amazonaws.com'},
  'ap-northeast-3': {websiteEndpoint: 's3-website.ap-northeast-3.amazonaws.com'},
  'ap-southeast-1': {websiteEndpoint: 's3-website-ap-southeast-1.amazonaws.com'},
  'ap-southeast-2': {websiteEndpoint: 's3-website-ap-southeast-2.amazonaws.com'},
  'cn-northwest-1': {websiteEndpoint: 's3-website.cn-northwest-1.amazonaws.com.cn'},
  'eu-central-1': {websiteEndpoint: 's3-website.eu-central-1.amazonaws.com'},
  'eu-west-1': {websiteEndpoint: 's3-website-eu-west-1.amazonaws.com'},
  'eu-west-2': {websiteEndpoint: 's3-website.eu-west-2.amazonaws.com'},
  'eu-west-3': {websiteEndpoint: 's3-website.eu-west-3.amazonaws.com'},
  'eu-north-1': {websiteEndpoint: 's3-website.eu-north-1.amazonaws.com'},
  'af-south-1': {websiteEndpoint: 's3-website.af-south-1.amazonaws.com'}
};

export function getS3Endpoint(bucketName: string) {
  return `${bucketName}.s3.amazonaws.com`;
}

export function getS3WebsiteEndpoint(regionName = 'us-east-1') {
  const region = S3_REGIONS[regionName];

  if (region === undefined) {
    throw new Error(`Sorry, the AWS S3 region '${regionName}' is not supported yet`);
  }

  return region.websiteEndpoint;
}

export function getS3WebsiteDomainName(bucketName: string, regionName: string) {
  return `${bucketName}.${getS3WebsiteEndpoint(regionName)}`;
}

export function formatS3URL({bucket, key}: {bucket: string; key: string}) {
  return `https://${getS3Endpoint(bucket)}/${key}`;
}

export function parseS3URL(url: string) {
  const matches = url.match(/^https:\/\/(.+)\.s3\.amazonaws\.com\/(.+)$/i);

  if (matches === null) {
    throw new Error(`The S3 URL '${url}' is invalid`);
  }

  return {bucket: matches[1], key: matches[2]};
}
