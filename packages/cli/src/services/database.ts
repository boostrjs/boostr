import type {MongoMemoryServer} from 'mongodb-memory-server-global';
import {join} from 'path';
import fsExtra from 'fs-extra';

import {Subservice} from './sub.js';
import type {Command} from '../command.js';
import {BackendService} from './backend.js';
import {requireGlobalPackage} from '../npm.js';

const LOCAL_DATA_DIRECTORY_NAME = 'data';

export class DatabaseService extends Subservice {
  static type = 'database';

  static description = 'A database service providing some storage capability to your application.';

  static examples = [
    'boostr {{serviceName}} start',
    'boostr {{serviceName}} migrate',
    'boostr {{serviceName}} migrate --production'
  ];

  parseConfigURL() {
    const directory = this.getDirectory();
    const config = this.getConfig();

    const {protocol, hostname, port, pathname} = this._parseConfigURL();

    if (config.platform === 'local') {
      if (protocol !== 'mongodb:') {
        this.throwError(
          `The 'url' property in the configuration should start with 'mongodb://' (directory: '${directory}')`
        );
      }

      if (hostname !== 'localhost') {
        this.throwError(
          `The host of the 'url' property in the configuration should be 'localhost' (directory: '${directory}')`
        );
      }

      if (!port) {
        this.throwError(
          `The 'url' property in the configuration should specify a port (directory: '${directory}')`
        );
      }

      if (pathname.length < 2) {
        this.throwError(
          `The 'url' property in the configuration should specify a database name (directory: '${directory}')`
        );
      }
    } else {
      this.throwError('Non-local database URL cannot be parsed for now');
    }

    return {protocol, hostname, port, pathname};
  }

  // === Commands ===

  static commands: Record<string, Command> = {
    ...Subservice.commands,

    migrate: {
      ...Subservice.commands.migrate,
      description: 'Migrate the current database.',
      examples: ['boostr {{serviceName}} migrate'],
      async handler(this: DatabaseService) {
        await this.migrate();
      }
    }
  };

  _localServer?: MongoMemoryServer;

  async start() {
    await super.start();

    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    if (config.platform !== 'local') {
      return;
    }

    const {port, pathname} = this.parseConfigURL();

    const databaseName = pathname.slice(1);

    const dataDirectory = join(directory, LOCAL_DATA_DIRECTORY_NAME);

    fsExtra.ensureDirSync(dataDirectory);

    const {MongoMemoryServer} = await requireGlobalPackage(
      'mongodb-memory-server-global',
      '6.9.6',
      {serviceName}
    );

    this._localServer = new MongoMemoryServer({
      instance: {
        port,
        dbName: databaseName,
        dbPath: dataDirectory,
        storageEngine: 'wiredTiger'
      }
    }) as MongoMemoryServer;

    let connectionString = await this._localServer.getUri();

    connectionString = connectionString.replace('127.0.0.1', 'localhost');

    if (connectionString.endsWith('?')) {
      connectionString = connectionString.slice(0, -1);
    }

    this.logMessage(`MongoDB server started at ${connectionString}`);
  }

  async stop() {
    if (this._localServer !== undefined) {
      await this._localServer.stop();

      this.logMessage(`MongoDB server stopped`);
    }
  }

  async migrate() {
    const directory = this.getDirectory();
    const {url} = this.getConfig();

    if (!url) {
      this.throwError(
        `A 'url' property is required in the configuration to migrate a database (directory: '${directory}')`
      );
    }

    await this.start();

    for (const service of this.getDependents()) {
      if (service instanceof BackendService) {
        await service.migrateDatabase(url);
      }
    }

    await this.stop();
  }
}
