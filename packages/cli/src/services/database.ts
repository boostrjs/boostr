import {join} from 'path';
import fsExtra from 'fs-extra';
import {MongoMemoryServer} from 'mongodb-memory-server-global';

import {Subservice} from './sub.js';
import {BackendService} from './backend.js';

const LOCAL_DATA_DIRECTORY_NAME = 'data';

export class DatabaseService extends Subservice {
  static type = 'database';

  static help = 'Database help...';

  // === Commands ===

  static commands = {
    ...Subservice.commands,

    migrate: {
      async handler(this: DatabaseService) {
        await this.migrate();
      },
      help: 'Migrate help...'
    }
  };

  _localServer?: MongoMemoryServer;

  async start() {
    await super.start();

    const directory = this.getDirectory();
    const config = this.getConfig();

    if (config.platform !== 'local') {
      return;
    }

    if (!config.url) {
      this.throwError(
        `A 'url' property is required in the configuration to start a local database (directory: '${directory}')`
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

    const port = Number(portString);

    if (!port) {
      this.throwError(
        `The 'url' property in the configuration should specify a port (directory: '${directory}')`
      );
    }

    const databaseName = pathname.slice(1);

    if (!databaseName) {
      this.throwError(
        `The 'url' property in the configuration should specify a database name (directory: '${directory}')`
      );
    }

    const dataDirectory = join(directory, LOCAL_DATA_DIRECTORY_NAME);

    fsExtra.ensureDirSync(dataDirectory);

    this._localServer = new MongoMemoryServer({
      instance: {
        port,
        dbName: databaseName,
        dbPath: dataDirectory,
        storageEngine: 'wiredTiger'
      }
    });

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
