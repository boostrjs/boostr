import fsExtra from 'fs-extra';
import {join, dirname, basename, extname} from 'path';
import walkSync from 'walk-sync';
import escape from 'lodash/escape.js';

import {Subservice} from './sub.js';
import {bundle} from '../bundler.js';
import {SinglePageApplicationServer} from '../spa-server.js';
import {resolveVariables, generateHashFromFile} from '../util.js';

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="{{language}}">
  <head>
    <title>{{headTitle}}</title>
    {{headMetas}}
    {{headLinks}}
    {{headStyle}}
    {{headScripts}}
  </head>
  <body>
    <noscript><p>Sorry, this site requires JavaScript to be enabled.</p></noscript>
    {{bodyScripts}}
    <div id="root"></div>
    <script src="{{bundleURL}}"></script>
  </body>
</html>
`;

const BOOTSTRAP_TEMPLATE = `
import React from 'react';
import ReactDOM from 'react-dom';
import {useBrowserRouter} from '@layr/react-integration';

import componentGetter from '{{entryPoint}}';

async function main() {
  let content;

  try {
    const Component = await componentGetter();

    const RootView = () => {
      const [router, isReady] = useBrowserRouter(Component);

      if (!isReady) {
        return null;
      }

      const content = router.callCurrentRoute({
        fallback: () => 'Route not found'
      });

      return content;
    }

    content = React.createElement(RootView);
  } catch (err) {
    console.error(err);

    content = React.createElement('pre', undefined, err.stack);
  }

  ReactDOM.render(content, document.getElementById('root'));
}

main().catch((error) => {
  console.error(error);
});
`;

const BOOTSTRAP_LOCAL = `
function openWebSocket(isFirstTime = true) {
  const webSocket = new WebSocket('ws://' + window.location.host);

  webSocket.addEventListener('open', () => {
    if (!isFirstTime) {
      window.location.reload();
    }
  });

  webSocket.addEventListener('message', (event) => {
    if (event.data === 'restart') {
      window.location.reload();
    }
  });

  webSocket.addEventListener('close', () => {
    setTimeout(() => { openWebSocket(false); }, 10000); // 10 seconds
  });
}

openWebSocket();
`;

const PUBLIC_DIRECTORY_NAME = 'public';
const IMMUTABLE_EXTENSION = '.immutable';

export class WebFrontendService extends Subservice {
  static type = 'web-frontend';

  static help = 'Web frontend help...';

  // === Commands ===

  static commands = {
    ...Subservice.commands,

    freeze: {
      async handler(this: WebFrontendService) {
        await this.freeze();
      },
      help: 'Freeze help...'
    }
  };

  async build({watch = false}: {watch?: {afterRebuild?: () => void} | boolean} = {}) {
    await super.build();

    const directory = this.getDirectory();
    const serviceName = this.getName();
    const stage = this.getStage();
    const {environment, platform, build: buildConfig, html: htmlConfig} = this.getConfig();

    const buildDirectory = join(directory, 'build', stage);

    fsExtra.emptyDirSync(buildDirectory);

    const isLocal = platform === 'local';

    let bootstrapTemplate = BOOTSTRAP_TEMPLATE;

    if (isLocal) {
      bootstrapTemplate += BOOTSTRAP_LOCAL;
    }

    const bundleFile = await bundle({
      rootDirectory: directory,
      buildDirectory,
      bootstrapTemplate,
      serviceName,
      stage,
      environment,
      sourceMap: buildConfig?.sourceMap ?? isLocal,
      minify: buildConfig?.minify ?? !isLocal,
      watch,
      freeze: !isLocal,
      esbuildOptions: {
        target: 'es2017',
        platform: 'browser',
        mainFields: ['browser', 'module', 'main']
      }
    });

    buildHTMLFile({buildDirectory, bundleFile, htmlConfig});

    const publicDirectory = join(directory, PUBLIC_DIRECTORY_NAME);
    fsExtra.copySync(publicDirectory, buildDirectory);

    return buildDirectory;
  }

  async start() {
    await super.start();

    const directory = this.getDirectory();
    const config = this.getConfig();
    const serviceName = this.getName();

    if (config.platform !== 'local') {
      return;
    }

    if (!config.url) {
      this.throwError(
        `A 'url' property is required in the configuration to start a local server (directory: '${directory}')`
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

    if (protocol !== 'http:') {
      this.throwError(
        `The 'url' property in the configuration should start with 'http://' (directory: '${directory}')`
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

    if (pathname !== '/') {
      this.throwError(
        `The path of the 'url' property in the configuration should be '/' (directory: '${directory}')`
      );
    }

    let server: SinglePageApplicationServer;

    const buildDirectory = await this.build({
      watch: {
        afterRebuild() {
          server.restartClients();
        }
      }
    });

    server = new SinglePageApplicationServer({directory: buildDirectory, serviceName, port});

    await server.start();
  }

  async freeze() {
    const publicDirectory = join(this.getDirectory(), PUBLIC_DIRECTORY_NAME);

    const files = walkSync(publicDirectory, {directories: false, includeBasePath: true});

    for (const file of files) {
      const directory = dirname(file);
      const fileName = basename(file);
      const extension = extname(fileName);
      const fileNameWithoutExtension = fileName.slice(0, -extension.length);

      if (fileName.endsWith(IMMUTABLE_EXTENSION + extension)) {
        continue;
      }

      const hash = generateHashFromFile(file);
      const newFileName = fileNameWithoutExtension + '-' + hash + IMMUTABLE_EXTENSION + extension;
      const newFile = join(directory, newFileName);

      fsExtra.moveSync(file, newFile, {overwrite: true});

      this.logMessage(`File frozen ('${fileName}' -> '${newFileName}')`);
    }
  }
}

function buildHTMLFile({
  buildDirectory,
  bundleFile,
  htmlConfig = {}
}: {
  buildDirectory: string;
  bundleFile: string;
  htmlConfig: Record<string, any>;
}) {
  const language = escape(htmlConfig.language ?? '');

  const headConfig = htmlConfig.head ?? {};
  const headTitle = escape(headConfig.title ?? '');
  const headMetas = buildTags('meta', headConfig.metas);
  const headLinks = buildTags('link', headConfig.links);
  const headStyle =
    headConfig.style !== undefined ? `<style>\n${headConfig.style}\n    </style>` : '';
  const headScripts = buildTags('script', headConfig.scripts);

  const bodyConfig = htmlConfig.body ?? {};
  const bodyScripts = buildTags('script', bodyConfig.scripts);

  const bundleURL = `/${basename(bundleFile)}`;

  const htmlContent = removeEmptyLines(
    resolveVariables(HTML_TEMPLATE, {
      language,
      headTitle,
      headMetas,
      headLinks,
      headStyle,
      headScripts,
      bodyScripts,
      bundleURL
    })
  );

  const htmlFile = join(buildDirectory, 'index.html');

  fsExtra.outputFileSync(htmlFile, htmlContent);
}

type Spec = Attributes | string | [Attributes, string];
type Attributes = Record<string, string | boolean>;

function buildTags(tagName: string, specOrSpecs: Spec[] | Spec = []) {
  const specs = Array.isArray(specOrSpecs) ? specOrSpecs : [specOrSpecs];

  let tags = '';

  for (const spec of specs) {
    let attributes: Attributes;
    let content: string;

    if (Array.isArray(spec)) {
      attributes = spec[0] ?? {};
      content = spec[1] ?? '';
    } else if (typeof spec === 'object') {
      attributes = spec;
      content = '';
    } else {
      attributes = {};
      content = spec;
    }

    const formattedAttributes = [];

    for (const [name, value] of Object.entries(attributes)) {
      if (typeof value === 'boolean') {
        if (value) {
          formattedAttributes.push(name);
        }
      } else {
        formattedAttributes.push(`${name}="${escape(value)}"`);
      }
    }

    let tag = `<${tagName}`;

    if (formattedAttributes.length > 0) {
      tag += ` ${formattedAttributes.join(' ')}`;
    }

    if (content !== '' || tagName === 'script') {
      tag += `>${content !== '' ? `\n${content}\n    ` : ''}</${tagName}>`;
    } else {
      tag += ' />';
    }

    tags += `${tags === '' ? tag : `\n    ${tag}`}`;
  }

  return tags;
}

function removeEmptyLines(text: string) {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .join('\n');
}
