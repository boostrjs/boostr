import fsExtra from 'fs-extra';
import {join, dirname, basename, extname} from 'path';
import walkSync from 'walk-sync';
import chokidar from 'chokidar';
import escape from 'lodash/escape.js';
import debounce from 'lodash/debounce.js';

import {Subservice} from './sub.js';
import type {Command} from '../command.js';
import {check} from '../checker.js';
import {build} from '../builder.js';
import {SinglePageApplicationServer} from '../spa-server.js';
import {AWSWebsiteResource} from '../resources/aws/website.js';
import {resolveVariables, generateHashFromFile} from '../utilities.js';

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="{{language}}">
  <head>
    {{headMetas}}
    <title>{{headTitle}}</title>
    {{headLinks}}
    {{headStyle}}
    {{headScripts}}
  </head>
  <body>
    <noscript><p>Sorry, this site requires JavaScript to be enabled.</p></noscript>
    {{bodyScripts}}
    <div id="root"></div>
    <script src="{{jsBundleURL}}"></script>
  </body>
</html>
`;

const BOOTSTRAP_TEMPLATE = `
import React from 'react';
import ReactDOM from 'react-dom';
import {BrowserRootView, BrowserNavigatorView} from '@layr/react-integration';

import rootComponentGetter from '{{entryPoint}}';

async function main() {
  let content;

  try {
    const rootComponent = await rootComponentGetter();

    await rootComponent.initialize();

    content = React.createElement(
      BrowserRootView,
      undefined,
      React.createElement(BrowserNavigatorView, {rootComponent})
    );
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
function openWebSocket({reconnectionCount = 0} = {}) {
  const webSocket = new WebSocket('ws://' + window.location.host);

  webSocket.addEventListener('open', () => {
    if (reconnectionCount !== 0) {
      window.location.reload();
    }
  });

  webSocket.addEventListener('message', (event) => {
    if (event.data === 'restart') {
      window.location.reload();
    }
  });

  webSocket.addEventListener('close', () => {
    setTimeout(() => {
      reconnectionCount++;

      if (reconnectionCount > 30) {
        console.warn(
          'Automatic refresh disabled because the server has not responded for 5 minutes.'
        );

        return;
      }

      openWebSocket({reconnectionCount});
    }, 10000); // 10 seconds
  });
}

openWebSocket();
`;

const PUBLIC_DIRECTORY_NAME = 'public';
const IMMUTABLE_EXTENSION = '.immutable';

export class WebFrontendService extends Subservice {
  static type = 'web-frontend';

  static description = 'A web frontend service providing a user interface for your application.';

  static examples = [
    'boostr {{serviceName}} deploy --skip=backend',
    'boostr {{serviceName}} freeze',
    'boostr {{serviceName}} npm install lodash'
  ];

  // === Commands ===

  static commands: Record<string, Command> = {
    ...Subservice.commands,

    freeze: {
      ...Subservice.commands.freeze,
      description: 'Freeze all the files that are present in the public directory.',
      examples: ['boostr {{serviceName}} freeze'],
      async handler(this: WebFrontendService) {
        await this.freeze();
      }
    }
  };

  async check() {
    await super.check();

    const serviceDirectory = this.getDirectory();
    const serviceName = this.getName();

    await check({serviceDirectory, serviceName});
  }

  async build({watch = false}: {watch?: {afterRebuild?: () => void} | boolean} = {}) {
    await super.build();

    const serviceDirectory = this.getDirectory();
    const serviceName = this.getName();
    const stage = this.getStage();
    const {
      environment,
      platform,
      rootComponent,
      build: buildConfig = {},
      html: htmlConfig,
      hooks
    } = this.getConfig();

    if (!rootComponent) {
      this.throwError(
        `A 'rootComponent' property is required in the configuration (directory: '${serviceDirectory}')`
      );
    }

    const buildDirectory = join(serviceDirectory, 'build', stage);

    fsExtra.emptyDirSync(buildDirectory);

    const isLocal = platform === 'local';

    let bootstrapTemplate = BOOTSTRAP_TEMPLATE;

    if (isLocal) {
      bootstrapTemplate += BOOTSTRAP_LOCAL;
    }

    const {jsBundleFile, cssBundleFile} = await build({
      serviceDirectory,
      entryPoint: rootComponent,
      buildDirectory,
      bootstrapTemplate,
      serviceName,
      environment,
      sourceMap: buildConfig.sourceMap ?? isLocal,
      minify: buildConfig.minify ?? !isLocal,
      watch,
      freeze: !isLocal,
      esbuildOptions: {
        target: 'es2020',
        platform: 'browser',
        mainFields: ['browser', 'module', 'main'],
        publicPath: '/',
        define: {global: 'window'}
      }
    });

    const htmlFile = buildHTMLFile({buildDirectory, jsBundleFile, cssBundleFile, htmlConfig});

    const publicDirectory = join(serviceDirectory, PUBLIC_DIRECTORY_NAME);

    fsExtra.copySync(publicDirectory, buildDirectory);

    if (watch) {
      // TODO: Implement a proper syncing mechanism
      chokidar.watch(publicDirectory, {ignoreInitial: true}).on(
        'all',
        debounce(() => {
          fsExtra.copySync(publicDirectory, buildDirectory);
          this.logMessage(`Public directory synchronized`);
        }, 200)
      );
    }

    if (hooks?.afterBuild !== undefined) {
      // TODO: Handle watch mode
      await hooks.afterBuild({
        serviceDirectory,
        serviceName,
        stage,
        platform,
        buildDirectory,
        htmlFile,
        jsBundleFile,
        cssBundleFile
      });
    }

    return {buildDirectory, htmlFile, jsBundleFile, cssBundleFile};
  }

  async start() {
    await super.start();

    const config = this.getConfig();
    const serviceName = this.getName();

    if (config.platform !== 'local') {
      return;
    }

    const {port} = this.parseConfigURL();

    let server: SinglePageApplicationServer;

    const {buildDirectory} = await this.build({
      watch: {
        afterRebuild() {
          server.restartClients();
        }
      }
    });

    server = new SinglePageApplicationServer({directory: buildDirectory, serviceName, port});

    await server.start();
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

    const {hostname} = this.parseConfigURL();

    await this.check();

    const {buildDirectory} = await this.build();

    const resource = new AWSWebsiteResource(
      {
        domainName: hostname,
        region: config.aws?.region,
        profile: config.aws?.profile,
        accessKeyId: config.aws?.accessKeyId,
        secretAccessKey: config.aws?.secretAccessKey,
        directory: buildDirectory,
        cloudFront: {
          priceClass: config.aws?.cloudFront?.priceClass
        }
      },
      {serviceName}
    );

    await resource.initialize();

    await resource.deploy();
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
  jsBundleFile,
  cssBundleFile,
  htmlConfig = {}
}: {
  buildDirectory: string;
  jsBundleFile: string;
  cssBundleFile: string | undefined;
  htmlConfig: Record<string, any>;
}) {
  const language = escape(htmlConfig.language ?? '');

  const headConfig = htmlConfig.head ?? {};

  let headConfigLinks = headConfig.links ?? [];
  headConfigLinks = Array.isArray(headConfigLinks) ? headConfigLinks : [headConfigLinks];

  if (cssBundleFile !== undefined) {
    const cssBundleURL = `/${basename(cssBundleFile)}`;
    headConfigLinks.push({rel: 'stylesheet', href: cssBundleURL});
  }

  const headTitle = escape(headConfig.title ?? '');
  const headMetas = buildTags('meta', headConfig.metas);
  const headLinks = buildTags('link', headConfigLinks);
  const headStyle =
    headConfig.style !== undefined ? `<style>\n${headConfig.style}\n    </style>` : '';
  const headScripts = buildTags('script', headConfig.scripts);

  const bodyConfig = htmlConfig.body ?? {};
  const bodyScripts = buildTags('script', bodyConfig.scripts);

  const jsBundleURL = `/${basename(jsBundleFile)}`;

  const htmlContent = removeEmptyLines(
    resolveVariables(HTML_TEMPLATE, {
      language,
      headTitle,
      headMetas,
      headLinks,
      headStyle,
      headScripts,
      bodyScripts,
      jsBundleURL
    })
  );

  const htmlFile = join(buildDirectory, 'index.html');

  fsExtra.outputFileSync(htmlFile, htmlContent);

  return htmlFile;
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
