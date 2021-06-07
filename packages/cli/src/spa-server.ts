import Koa from 'koa';
import koaSend from 'koa-send';
import WebSocket, {Server as WebSocketServer} from 'ws';
import {join} from 'path';
import type {Server} from 'http';

import {logMessage, throwError, fileExists} from './util.js';

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
  _webSocketServer?: WebSocketServer;

  start() {
    const koa = new Koa();

    koa.use(async (ctx) => {
      if (ctx.request.method !== 'GET') {
        ctx.throw(405);
      }

      let fileRelative = ctx.request.path.slice(1);

      if (fileRelative !== '' && fileRelative !== 'favicon.ico') {
        const file = join(this.directory, fileRelative);

        if (!fileExists(file)) {
          fileRelative = INDEX_PAGE;
        }
      }

      const path = '/' + fileRelative;

      await koaSend(ctx, path, {
        root: this.directory,
        index: INDEX_PAGE,
        gzip: false,
        brotli: false,
        format: false
      });
    });

    return new Promise<void>((resolve) => {
      if (this._server !== undefined) {
        throwError('The single-page application server is already started', {
          serviceName: this.serviceName
        });
      }

      this._server = koa.listen(this.port, () => {
        this._webSocketServer = new WebSocket.Server({server: this._server});

        logMessage(`Single-page application server started at http://localhost:${this.port}/`, {
          serviceName: this.serviceName
        });

        resolve();
      });
    });
  }

  restartClients() {
    if (this._webSocketServer !== undefined) {
      for (const webSocket of this._webSocketServer.clients) {
        webSocket.send('restart');
      }
    }
  }
}
