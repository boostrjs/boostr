import Koa from 'koa';
import send from 'koa-send';
import {existsSync} from 'fs';
import {join} from 'path';
import type {Server} from 'http';

import {logMessage, throwError} from './util.js';

const INDEX_PAGE = 'index.html';

export class SinglePageApplicationServer {
  directory!: string;
  serviceName?: string;
  port!: number;

  constructor({
    directory,
    serviceName,
    port
  }: {
    directory: string;
    serviceName?: string;
    port: number;
  }) {
    this.directory = directory;
    this.serviceName = serviceName;
    this.port = port;
  }

  _server?: Server;

  start() {
    if (this._server !== undefined) {
      throwError('The single-page application server is already started', {
        serviceName: this.serviceName
      });
    }

    const koa = new Koa();

    koa.use(async (ctx) => {
      if (ctx.request.method !== 'GET') {
        ctx.throw(405);
      }

      let fileRelative = ctx.request.path.slice(1);

      if (fileRelative !== '' && fileRelative !== 'favicon.ico') {
        const file = join(this.directory, fileRelative);

        if (!existsSync(file)) {
          fileRelative = INDEX_PAGE;
        }
      }

      const path = '/' + fileRelative;

      await send(ctx, path, {
        root: this.directory,
        index: INDEX_PAGE,
        gzip: false,
        brotli: false,
        format: false
      });
    });

    return new Promise<void>((resolve) => {
      this._server = koa.listen(this.port, () => {
        logMessage(`Single-page application server started at http://localhost:${this.port}/`, {
          serviceName: this.serviceName
        });

        resolve();
      });
    });
  }

  stop() {
    const server = this._server;

    if (server === undefined) {
      throwError('The single-page application server is not started', {
        serviceName: this.serviceName
      });
    }

    return new Promise<void>((resolve) => {
      server.close(() => {
        this._server = undefined;

        logMessage(`Single-page application server stopped`, {
          serviceName: this.serviceName
        });

        resolve();
      });
    });
  }
}
