import fsExtra from 'fs-extra';
import {join, dirname, basename, extname} from 'path';
import walkSync from 'walk-sync';
import escape from 'lodash/escape.js';

import {Subservice} from './sub.js';
import type {Command} from '../command.js';
import {bundle} from '../bundler.js';
import {SinglePageApplicationServer} from '../spa-server.js';
import {AWSWebsiteResource} from '../resources/aws/website.js';
import {resolveVariables, generateHashFromFile} from '../util.js';

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
    <script src="{{bundleURL}}"></script>
  </body>
</html>
`;

const BOOTSTRAP_TEMPLATE = `
import React from 'react';
import ReactDOM from 'react-dom';
import {callRouteByURL} from '@layr/routable';
import {RootView, useBrowserNavigator} from '@layr/react-integration';

import componentGetter from '{{entryPoint}}';

async function main() {
  let content;

  try {
    const Component = await componentGetter();

    const NavigatorView = () => {
      const [navigator, isReady] = useBrowserNavigator(Component);

      if (!isReady) {
        return null;
      }

      return callRouteByURL(Component, navigator.getCurrentURL());
    }

    content = React.createElement(RootView, undefined, React.createElement(NavigatorView));
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

  static description = 'A web frontend service providing a user interface for your application.';

  static examples = [
    'boostr {{serviceName}} deploy --skip=backend',
    'boostr {{serviceName}} freeze',
    'boostr {{serviceName}} npm install lodash'
  ];

  getBuildDirectory() {
    const serviceDirectory = this.getDirectory();
    const stage = this.getStage();

    return join(serviceDirectory, 'build', stage);
  }

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

  async build({watch = false}: {watch?: {afterRebuild?: () => void} | boolean} = {}) {
    await super.build();

    const serviceDirectory = this.getDirectory();
    const serviceName = this.getName();
    const stage = this.getStage();
    const {environment, platform, build: buildConfig, html: htmlConfig} = this.getConfig();

    const buildDirectory = this.getBuildDirectory();

    fsExtra.emptyDirSync(buildDirectory);

    const isLocal = platform === 'local';

    let bootstrapTemplate = BOOTSTRAP_TEMPLATE;

    if (isLocal) {
      bootstrapTemplate += BOOTSTRAP_LOCAL;
    }

    const bundleFile = await bundle({
      serviceDirectory,
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
        mainFields: ['browser', 'module', 'main'],
        publicPath: '/'
      }
    });

    const htmlFile = buildHTMLFile({buildDirectory, bundleFile, htmlConfig});

    const publicDirectory = join(serviceDirectory, PUBLIC_DIRECTORY_NAME);
    fsExtra.copySync(publicDirectory, buildDirectory);

    return {buildDirectory, htmlFile, bundleFile};
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

    const {hostname} = this.parseConfigURL();

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
