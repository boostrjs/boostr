import type AWS from 'aws-sdk';
import {statSync, createReadStream} from 'fs';
import {join} from 'path';
import walkSync from 'walk-sync';
import isEqual from 'lodash/isEqual.js';
import hasha from 'hasha';
import minimatch from 'minimatch';
import bytes from 'bytes';
import mime from 'mime';
import sleep from 'sleep-promise';

import {AWSBaseResource, AWSBaseResourceConfig, getS3WebsiteDomainName} from './base.js';
import {ResourceOptions} from '../base.js';

const DEFAULT_INDEX_PAGE = 'index.html';
const DEFAULT_IMMUTABLE_FILES = ['**/*.immutable.*'];
const DEFAULT_CLOUDFRONT_PRICE_CLASS = 'PriceClass_100';

const CONFIG_FILE_S3_KEY = '.boostr.json';
const IMMUTABLE_FILES_MAX_AGE = 3153600000; // 100 years
const CLOUDFRONT_CACHING_MIN_TTL = 0;
const CLOUDFRONT_CACHING_DEFAULT_TTL = 86400; // 1 day
const CLOUDFRONT_CACHING_MAX_TTL = 3153600000; // 100 years
const CLOUDFRONT_ERROR_CACHING_MIN_TTL = 86400; // 1 day
const CLOUDFRONT_DISTRIBUTION_CUSTOM_ERROR_RESPONSES = {
  Quantity: 1,
  Items: [
    {
      ErrorCode: 404,
      ResponseCode: '200',
      ResponsePagePath: `/${DEFAULT_INDEX_PAGE}`,
      ErrorCachingMinTTL: CLOUDFRONT_ERROR_CACHING_MIN_TTL
    }
  ]
};
const CLOUDFRONT_HOSTED_ZONE_ID = 'Z2FDTNDATAQYW2';

export type AWSWebsiteResourceConfig = AWSBaseResourceConfig & {
  directory: string;
  indexPage?: string;
  immutableFiles?: string[];
  cloudFront?: {
    priceClass?: string;
  };
};

export class AWSWebsiteResource extends AWSBaseResource {
  static managerIdentifiers = [...AWSBaseResource.managerIdentifiers, 'aws-s3-hosted-website-v1'];

  constructor(config: AWSWebsiteResourceConfig, options: ResourceOptions = {}) {
    super(config, options);
  }

  _config!: ReturnType<AWSWebsiteResource['normalizeConfig']>;

  normalizeConfig(config: AWSWebsiteResourceConfig) {
    const {
      directory,
      indexPage = DEFAULT_INDEX_PAGE,
      immutableFiles = DEFAULT_IMMUTABLE_FILES,
      cloudFront: {priceClass = DEFAULT_CLOUDFRONT_PRICE_CLASS} = {},
      ...otherAttributes
    } = config;

    if (!directory) {
      this.throwError(`A 'directory' property is required in the configuration`);
    }

    return {
      ...super.normalizeConfig(otherAttributes),
      directory,
      indexPage,
      immutableFiles,
      cloudFront: {
        priceClass
      }
    };
  }

  async deploy() {
    const config = this.getConfig();

    this.logMessage(`Starting the deployment of a website to AWS...`);

    await this.getRoute53HostedZone();
    await this.createOrUpdateS3Bucket();
    const changes = await this.synchronizeFiles();
    const hasBeenCreated = await this.createOrUpdateCloudFrontDistribution();

    if (!hasBeenCreated && changes.length > 0) {
      await this.runCloudFrontInvalidation(changes);
    }

    await this.createOrUpdateCloudFrontDomainName();

    this.logMessage(`Deployment completed`);
    this.logMessage(`The website should be available at https://${config.domainName}`);
  }

  // === S3 ===

  async createOrUpdateS3Bucket() {
    const config = this.getConfig();
    const s3 = this.getS3Client();

    this.logMessage(`Checking the S3 bucket...`);

    const tags = await this.getS3BucketTags();

    if (tags === undefined) {
      // The bucket doesn't exist yet
      this.logMessage(`Creating the S3 bucket...`);

      const params: AWS.S3.CreateBucketRequest = {
        Bucket: this.getS3BucketName(),
        ACL: 'public-read'
      };

      if (config.region !== 'us-east-1') {
        params.CreateBucketConfiguration = {LocationConstraint: config.region};
      }

      await s3.createBucket(params).promise();

      await s3
        .putBucketTagging({
          Bucket: this.getS3BucketName(),
          Tagging: {TagSet: [{Key: 'managed-by', Value: this.constructor.managerIdentifiers[0]}]}
        })
        .promise();

      await s3
        .putBucketWebsite({
          Bucket: this.getS3BucketName(),
          WebsiteConfiguration: {IndexDocument: {Suffix: config.indexPage}}
        })
        .promise();

      await s3.waitFor('bucketExists', {Bucket: this.getS3BucketName()}).promise();
      await sleep(5000); // 5 secs
    } else {
      // The bucket already exists

      if (
        !tags.some(
          ({Key, Value}) =>
            Key === 'managed-by' && this.constructor.managerIdentifiers.includes(Value)
        )
      ) {
        this.throwError(
          `Cannot use a S3 bucket that was not originally created by this tool (bucket name: '${this.getS3BucketName()}')`
        );
      }

      const locationConstraint =
        (await s3.getBucketLocation({Bucket: this.getS3BucketName()}).promise())
          .LocationConstraint || 'us-east-1';

      if (locationConstraint !== config.region) {
        this.throwError(
          `Sorry, it is not currently possible to change the region of a S3 bucket. Please remove the bucket '${this.getS3BucketName()}' manually or set 'region' to '${locationConstraint}'.`
        );
      }

      const websiteConfiguration = await s3
        .getBucketWebsite({Bucket: this.getS3BucketName()})
        .promise();

      if (websiteConfiguration.IndexDocument?.Suffix !== config.indexPage) {
        this.logMessage(`Updating the S3 bucket website configuration...`);

        websiteConfiguration.IndexDocument = {Suffix: config.indexPage};
        await s3
          .putBucketWebsite({
            Bucket: this.getS3BucketName(),
            WebsiteConfiguration: websiteConfiguration
          })
          .promise();
      }
    }
  }

  async getS3BucketTags() {
    const s3 = this.getS3Client();

    try {
      return (await s3.getBucketTagging({Bucket: this.getS3BucketName()}).promise()).TagSet;
    } catch (err) {
      if (err.code === 'NoSuchTagSet') {
        return [];
      }

      if (err.code === 'NoSuchBucket') {
        return undefined;
      }

      if (err.code === 'AccessDenied') {
        this.throwError(`Access denied to the S3 bucket '${this.getS3BucketName()}'`);
      }

      throw err;
    }
  }

  async synchronizeFiles() {
    const config = this.getConfig();
    const s3 = this.getS3Client();

    this.logMessage(`Synchronizing the files...`);

    const files = walkSync(config.directory, {directories: false, ignore: ['**/.*']});
    const previousConfig = await this.loadConfigFromS3();
    const s3Files = await this.listS3Files();
    const changes = new Array<string>();

    let addedFiles = 0;
    let updatedFiles = 0;
    let removedFiles = 0;

    for (const file of files) {
      const absoluteFile = join(config.directory, file);
      const md5 = hasha.fromFileSync(absoluteFile, {algorithm: 'md5'});
      const size = statSync(absoluteFile).size;
      const isImmutable = matchFilePatterns(file, config.immutableFiles);

      let s3File: {path: string; size: number; md5: string} | undefined;

      const index = s3Files.findIndex(({path}) => path === file);

      if (index !== -1) {
        s3File = s3Files[index];
        s3Files.splice(index, 1);
      }

      if (s3File !== undefined && s3File.size === size && s3File.md5 === md5) {
        const wasImmutable = matchFilePatterns(file, previousConfig.immutableFiles);

        if (isImmutable === wasImmutable) {
          continue; // No changes
        }
      }

      this.logMessage(`Uploading '${file}' (${bytes(size)}) to S3...`);

      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.getS3BucketName(),
        Key: file,
        ACL: 'public-read',
        Body: createReadStream(absoluteFile),
        ContentType: mime.getType(file) ?? 'application/octet-stream',
        ContentMD5: Buffer.from(md5, 'hex').toString('base64')
      };

      if (isImmutable) {
        params.CacheControl = `max-age=${IMMUTABLE_FILES_MAX_AGE}`;
      }

      await s3.putObject(params).promise();

      if (s3File === undefined) {
        addedFiles++;
      } else {
        updatedFiles++;
      }

      changes.push(file);
    }

    for (const s3File of s3Files) {
      this.logMessage(`Removing '${s3File.path}' from S3...`);
      await s3.deleteObject({Bucket: this.getS3BucketName(), Key: s3File.path}).promise();
      removedFiles++;
      changes.push(s3File.path);
    }

    if (!isEqual(config, previousConfig)) {
      await this.saveConfigToS3();
    }

    let info = '';

    const buildInfo = (operation: string, fileCount: number) => {
      if (fileCount === 0) {
        return;
      }

      if (info !== '') {
        info += ', ';
      }

      info += `${fileCount} file`;

      if (fileCount > 1) {
        info += 's';
      }

      info += ` ${operation}`;
    };

    buildInfo('added', addedFiles);
    buildInfo('updated', updatedFiles);
    buildInfo('removed', removedFiles);

    if (info === '') {
      info = 'no changes';
    }

    this.logMessage(`Synchronization completed (${info})`);

    return changes;
  }

  async listS3Files() {
    const s3 = this.getS3Client();

    this.logMessage(`Listing the existing files in S3...`);

    const files = [];

    let nextContinuationToken: string | undefined;

    do {
      const result = await s3
        .listObjectsV2({
          Bucket: this.getS3BucketName(),
          ContinuationToken: nextContinuationToken
        })
        .promise();

      for (const item of result.Contents!) {
        const path = item.Key!;
        const size = item.Size!;
        const md5 = item.ETag!.slice(1, -1);

        if (path[0] !== '.') {
          files.push({path, size, md5});
        }
      }

      nextContinuationToken = result.NextContinuationToken;
    } while (nextContinuationToken);

    return files;
  }

  async loadConfigFromS3() {
    const s3 = this.getS3Client();

    try {
      const result = await s3
        .getObject({
          Bucket: this.getS3BucketName(),
          Key: CONFIG_FILE_S3_KEY
        })
        .promise();

      return JSON.parse(result.Body as string);
    } catch (err) {
      if (err.code === 'NoSuchKey') {
        return {};
      }

      throw err;
    }
  }

  async saveConfigToS3() {
    const config = this.getConfig();
    const s3 = this.getS3Client();

    const body = JSON.stringify(config);
    const md5 = hasha(body, {algorithm: 'md5'});
    const contentMD5 = Buffer.from(md5, 'hex').toString('base64');

    await s3
      .putObject({
        Bucket: this.getS3BucketName(),
        Key: CONFIG_FILE_S3_KEY,
        Body: body,
        ContentType: 'application/json',
        ContentMD5: contentMD5
      })
      .promise();
  }

  getS3BucketName() {
    return this.getConfig().domainName;
  }

  // === CloudFront ===

  async createOrUpdateCloudFrontDistribution() {
    let hasBeenCreated;

    let status = await this.checkCloudFrontDistribution();

    if (status === 'NOT_FOUND') {
      await this.createCloudFrontDistribution();
      hasBeenCreated = true;
      status = 'DEPLOYING';
    } else if (status === 'NEEDS_UPDATE') {
      await this.updateCloudFrontDistribution();
      status = 'DEPLOYING';
    }

    if (status === 'DEPLOYING') {
      await this.waitForCloudFrontDistributionDeployment();
    }

    return hasBeenCreated;
  }

  async checkCloudFrontDistribution() {
    this.logMessage(`Checking the CloudFront distribution...`);

    const distribution = await this.getCloudFrontDistribution();

    if (distribution === undefined) {
      return 'NOT_FOUND';
    }

    await this.checkCloudFrontDistributionTags();

    if (!distribution.Enabled) {
      this.throwError(`The CloudFront distribution is disabled (ARN: '${distribution.ARN}')`);
    }

    if (await this.checkIfCloudFrontDistributionNeedsUpdate()) {
      return 'NEEDS_UPDATE';
    }

    if (distribution.Status !== 'Deployed') {
      return 'DEPLOYING';
    }

    return 'OKAY';
  }

  _cloudFrontDistribution?: AWS.CloudFront.DistributionSummary;

  async getCloudFrontDistribution() {
    if (this._cloudFrontDistribution === undefined) {
      const config = this.getConfig();
      const cloudFront = this.getCloudFrontClient();

      this.logMessage(`Searching for an existing CloudFront distribution...`);

      const result = await cloudFront.listDistributions().promise();

      for (const distribution of result.DistributionList!.Items!) {
        if (distribution.Aliases!.Items!.includes(config.domainName)) {
          this._cloudFrontDistribution = distribution;
          break;
        }
      }

      if (this._cloudFrontDistribution === undefined && result.DistributionList!.IsTruncated) {
        this.throwError(
          `Whoa, you have a lot of CloudFront distributions! Unfortunately, this tool cannot list them all.`
        );
      }
    }

    return this._cloudFrontDistribution;
  }

  async createCloudFrontDistribution() {
    const config = this.getConfig();
    const cloudFront = this.getCloudFrontClient();

    const certificate = await this.ensureACMCertificate({region: 'us-east-1'});

    this.logMessage(`Creating the CloudFront distribution...`);

    const params: AWS.CloudFront.CreateDistributionWithTagsRequest = {
      DistributionConfigWithTags: {
        DistributionConfig: {
          CallerReference: String(Date.now()),
          Aliases: {
            Quantity: 1,
            Items: [config.domainName]
          },
          DefaultRootObject: config.indexPage,
          Origins: this.generateCloudFrontDistributionOrigins(),
          DefaultCacheBehavior: this.generateCloudFrontDistributionDefaultCacheBehavior(),
          CacheBehaviors: {Quantity: 0, Items: []},
          CustomErrorResponses: CLOUDFRONT_DISTRIBUTION_CUSTOM_ERROR_RESPONSES,
          Comment: '',
          Logging: {Enabled: false, IncludeCookies: false, Bucket: '', Prefix: ''},
          PriceClass: config.cloudFront.priceClass,
          Enabled: true,
          ViewerCertificate: {
            ACMCertificateArn: certificate.arn,
            SSLSupportMethod: 'sni-only',
            MinimumProtocolVersion: 'TLSv1',
            Certificate: certificate.arn,
            CertificateSource: 'acm'
          },
          Restrictions: {GeoRestriction: {RestrictionType: 'none', Quantity: 0, Items: []}},
          WebACLId: '',
          HttpVersion: 'http2',
          IsIPV6Enabled: true
        },
        Tags: {
          Items: [{Key: 'managed-by', Value: this.constructor.managerIdentifiers[0]}]
        }
      }
    };

    const {Distribution: distribution} = await cloudFront
      .createDistributionWithTags(params)
      .promise();

    this._cloudFrontDistribution = (distribution as unknown) as AWS.CloudFront.DistributionSummary;

    return this._cloudFrontDistribution;
  }

  async checkIfCloudFrontDistributionNeedsUpdate() {
    const config = this.getConfig();

    const distribution = (await this.getCloudFrontDistribution())!;

    // if (!isEqual(distribution.Origins, this.generateCloudFrontDistributionOrigins())) {
    //   return true;
    // }

    // if (
    //   !isEqual(
    //     distribution.DefaultCacheBehavior,
    //     this.generateCloudFrontDistributionDefaultCacheBehavior()
    //   )
    // ) {
    //   return true;
    // }

    // if (
    //   !isEqual(distribution.CustomErrorResponses, CLOUDFRONT_DISTRIBUTION_CUSTOM_ERROR_RESPONSES)
    // ) {
    //   return true;
    // }

    if (distribution.PriceClass !== config.cloudFront.priceClass) {
      return true;
    }

    return false;
  }

  async updateCloudFrontDistribution() {
    const config = this.getConfig();
    const cloudFront = this.getCloudFrontClient();

    this.logMessage(`Updating the CloudFront distribution...`);

    const distribution = (await this.getCloudFrontDistribution())!;

    const {DistributionConfig: distConfig, ETag: eTag} = await cloudFront
      .getDistributionConfig({
        Id: distribution.Id
      })
      .promise();

    distConfig!.Origins = this.generateCloudFrontDistributionOrigins();

    distConfig!.DefaultCacheBehavior = this.generateCloudFrontDistributionDefaultCacheBehavior();

    distConfig!.CustomErrorResponses = CLOUDFRONT_DISTRIBUTION_CUSTOM_ERROR_RESPONSES;

    distConfig!.PriceClass = config.cloudFront.priceClass;

    await cloudFront
      .updateDistribution({
        Id: distribution.Id,
        IfMatch: eTag,
        DistributionConfig: distConfig!
      })
      .promise();
  }

  generateCloudFrontDistributionOrigins() {
    const config = this.getConfig();

    return {
      Quantity: 1,
      Items: [
        {
          Id: config.domainName,
          DomainName: getS3WebsiteDomainName(this.getS3BucketName(), config.region),
          OriginPath: '',
          CustomHeaders: {Quantity: 0, Items: []},
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: 'http-only',
            OriginSslProtocols: {Quantity: 3, Items: ['TLSv1', 'TLSv1.1', 'TLSv1.2']},
            OriginReadTimeout: 30,
            OriginKeepaliveTimeout: 30
          },
          ConnectionAttempts: 3,
          ConnectionTimeout: 10,
          OriginShield: {Enabled: false}
        }
      ]
    };
  }

  generateCloudFrontDistributionDefaultCacheBehavior() {
    const config = this.getConfig();

    return {
      TargetOriginId: config.domainName,
      ForwardedValues: {
        QueryString: false,
        Cookies: {Forward: 'none'},
        Headers: {Quantity: 0, Items: []},
        QueryStringCacheKeys: {Quantity: 0, Items: []}
      },
      TrustedSigners: {Enabled: false, Quantity: 0, Items: []},
      TrustedKeyGroups: {Enabled: false, Quantity: 0, Items: []},
      ViewerProtocolPolicy: 'redirect-to-https',
      AllowedMethods: {
        Quantity: 2,
        Items: ['HEAD', 'GET'],
        CachedMethods: {Quantity: 2, Items: ['HEAD', 'GET']}
      },
      SmoothStreaming: false,
      MinTTL: CLOUDFRONT_CACHING_MIN_TTL,
      DefaultTTL: CLOUDFRONT_CACHING_DEFAULT_TTL,
      MaxTTL: CLOUDFRONT_CACHING_MAX_TTL,
      Compress: true,
      LambdaFunctionAssociations: {Quantity: 0, Items: []},
      FieldLevelEncryptionId: ''
    };
  }

  async checkCloudFrontDistributionTags() {
    const cloudFront = this.getCloudFrontClient();
    const distribution = (await this.getCloudFrontDistribution())!;
    const result = await cloudFront.listTagsForResource({Resource: distribution.ARN}).promise();

    // isEqual(tag, {Key: 'managed-by', Value: MANAGER_IDENTIFIER})
    if (
      !result.Tags.Items!.some(
        ({Key, Value}) =>
          Key === 'managed-by' && this.constructor.managerIdentifiers.includes(Value!)
      )
    ) {
      this.throwError(
        `Cannot use a CloudFront distribution that was not originally created by this tool (ARN: '${distribution.ARN}')`
      );
    }
  }

  async runCloudFrontInvalidation(changes: string[]) {
    const config = this.getConfig();
    const cloudFront = this.getCloudFrontClient();

    if (changes.length === 0) {
      return;
    }

    this.logMessage(`Running the CloudFront invalidation...`);

    const distribution = (await this.getCloudFrontDistribution())!;

    const paths = new Array<string>();

    for (const change of changes) {
      paths.push('/' + change);

      if (change.endsWith('/' + config.indexPage)) {
        // 'section/index.html' => /section/
        paths.push('/' + change.slice(0, -config.indexPage.length));
      }
    }

    const {Invalidation: invalidation} = await cloudFront
      .createInvalidation({
        DistributionId: distribution.Id,
        InvalidationBatch: {
          CallerReference: String(Date.now()),
          Paths: {
            Quantity: paths.length,
            Items: paths
          }
        }
      })
      .promise();

    await this.waitForCloudFrontInvalidation(invalidation!.Id);
  }

  async waitForCloudFrontDistributionDeployment() {
    const cloudFront = this.getCloudFrontClient();

    this.logMessage(
      `Waiting for the CloudFront deployment (please be patient, it can take up to 30 minutes)...`
    );

    const distribution = (await this.getCloudFrontDistribution())!;

    let totalSleepTime = 0;
    const maxSleepTime = 60 * 60 * 1000; // 1 hour
    const sleepTime = 30 * 1000; // 30 seconds

    do {
      await sleep(sleepTime);
      totalSleepTime += sleepTime;

      const result = await cloudFront.getDistribution({Id: distribution.Id}).promise();

      if (result.Distribution?.Status === 'Deployed') {
        return;
      }
    } while (totalSleepTime <= maxSleepTime);

    this.throwError(`CloudFront deployment uncompleted after ${totalSleepTime / 1000} seconds`);
  }

  async waitForCloudFrontInvalidation(invalidationId: string) {
    const cloudFront = this.getCloudFrontClient();

    this.logMessage(`Waiting for the CloudFront invalidation...`);

    const distribution = (await this.getCloudFrontDistribution())!;

    let totalSleepTime = 0;
    const maxSleepTime = 10 * 60 * 1000; // 10 minutes
    const sleepTime = 10000; // 10 seconds

    do {
      await sleep(sleepTime);
      totalSleepTime += sleepTime;

      const result = await cloudFront
        .getInvalidation({
          DistributionId: distribution.Id,
          Id: invalidationId
        })
        .promise();

      if (result.Invalidation?.Status === 'Completed') {
        return;
      }
    } while (totalSleepTime <= maxSleepTime);

    this.throwError(`CloudFront invalidation uncompleted after ${totalSleepTime / 1000} seconds`);
  }

  async createOrUpdateCloudFrontDomainName() {
    const config = this.getConfig();

    this.logMessage(`Checking the CloudFront domain name...`);

    const distribution = (await this.getCloudFrontDistribution())!;

    await this.ensureRoute53Alias({
      name: config.domainName,
      targetDomainName: distribution.DomainName,
      targetHostedZoneId: CLOUDFRONT_HOSTED_ZONE_ID
    });
  }
}

function matchFilePatterns(file: string, patterns: string[] = []) {
  for (const pattern of patterns) {
    if (minimatch(file, pattern)) {
      return true;
    }
  }

  return false;
}
