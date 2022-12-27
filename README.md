<p align="center">
	<img src="assets/boostr-logo-with-icon.svg" width="200" alt="Boostr">
	<br>
	<br>
</p>

## Overview

Boostr is a companion tool for [Layr](https://layrjs.com).

In a nutshell, Boostr takes care of everything you need to build and deploy a Layr app so you can focus on what really matters — your app's code.

## Features

Here are the main features provided by Boostr:

- App templates so you can start a new app with a single command
- Fully managed local development environment:
  - Automatic frontend build and refresh
  - Automatic backend build and restart
  - Local development database (limited to [MongoDB](https://www.mongodb.com/) for now)
- Configuration management:
  - Environment variables with inheritance and cross-service referencing
  - Multiple stages (e.g., "development", "staging", or "production")
  - Public and private configurations
- Database migrations (limited to [MongoDB](https://www.mongodb.com/) for now)
- Serverless deployment with a single command (limited to [AWS](https://aws.amazon.com/) for now)

## Getting Started

### Installation

```sh
npm install --global boostr
```

> **Note:** Installing an NPM package globally is usually not recommended. But it's not a problem in this case because each app managed by Boostr uses a local Boostr package which is automatically installed. So the global Boostr package can be seen as a shortcut to the local Boostr packages installed in your apps, and, therefore, you can have different apps using different versions of Boostr.

### Creating a Layr App

Boostr provides an `initialize` command to initialize an app from a template.

For example, you can create a Layr web app using TypeScript with the following commands:

```sh
mkdir my-app
cd my-app
boostr initialize @boostr/web-app-ts
```

Check out the [`initialize`](#boostr-initialize-template-options) command for details.

### Starting a Layr App

Start your app in development mode with the following command:

```sh
boostr start
```

In the case of a web app, the terminal should output something like this:

```
[database] MongoDB server started at mongodb://localhost:18160/
[backend] Build succeeded (bundle size: 2.06MB)
[backend] Component HTTP server started at http://localhost:18159/
[frontend] Build succeeded (bundle size: 1.34MB)
[frontend] Single-page application server started at http://localhost:18158/
```

The last line corresponding to the frontend service should provide an URL you can open in a browser to display your app.

Check out the [`start`](#boostr-service-start-options) command for details.

### Deploying a Layr App

First, make sure that your frontend and backend Boostr configuration files (`frontend/boostr.config.mjs` and `backend/boostr.config.mjs`) specify the URLs you want to use for your app.

So, if you just created a web app with the [`initialize`](#boostr-initialize-template-options) command, replace all the occurrences of "example.com" with your domain name (e.g., "awesome.app") or subdomain name (e.g., "project1.awesome.app").

Then, run the following command to deploy your app to production:

```
boostr deploy --production
```

**Notes:**

- Currently, only [AWS](https://aws.amazon.com/) is supported as a deployment target.
- The DNS associated with your domain name must be managed by [Amazon Route 53](https://aws.amazon.com/route53/).
- The first deployment may take a while because several AWS services have to be set up, but subsequent deployments should be much faster.

Check out the [`deploy`](#boostr-service-deploy-options) command for details.

## Configuration Files

TODO

Note that the TCP ports used for each service are randomly set. It ensures that you will not encounter port conflicts while working on several apps simultaneously.

### Stages

TODO

## Inline Help

You can get some help from the Boostr CLI by using the `--help` option.

Get some general help by running the following:

```sh
boostr --help
```

Get some help for a global command (e.g., `start`) by running the following:

```sh
boostr start --help
```

Get some help for a specific service (e.g., "frontend") by running the following:

```sh
boostr frontend --help
```

Get some help for a command of a specific service (e.g., the `import` command of the "database" service) by running the following:

```sh
boostr database import --help
```

## Global Commands

Note that all the global commands accept some [global options](#global-options), and a few accept some specific options.

### `boostr initialize <template> [options]`

_Alias: `boostr init`_

Initializes your app within the current directory from the specified template.

The `<template>` argument specifies the template to use, which should be a published npm package.

Currently, two templates are available:

- **@boostr/web-app-js** for initializing a web app using JavaScript
- **@boostr/web-app-ts** for initializing a web app using TypeScript

We will publish more templates in the future. For example, some React Native or Electron app templates should soon be available.

A template is simply an npm package. So, the community can publish any new template, and if needed, you can create some templates for your personal use.

#### Options

In addition to the [global options](#global-options), the `initialize` command accepts the following option:

- `--name`: Specifies the name of your app (defaults to the name of the current directory).

#### Examples

```sh
# Creates a web app named `my-app` using TypeScript
mkdir my-app
cd my-app
boostr initialize @boostr/web-app-ts
```

```sh
# Creates a web app named `my-awesome-app` using JavaScript
mkdir my-directory
cd my-directory
boostr init @boostr/web-app-js --name=my-awesome-app
```

### `boostr [<service>] install [options]`

Installs all the npm dependencies used in your app (or a specified service).

Under the hood, this command runs `npm install`.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Installs all the npm dependencies used in your app
boostr install
```

```sh
# Installs all the npm dependencies used in the "frontend" service
boostr frontend install
```

### `boostr [<service>] update [options]`

Updates all the npm dependencies used in your app (or a specified service).

Under the hood, this command runs `npm update`.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Updates all the npm dependencies used in your app (including Boostr itself)
boostr update
```

```sh
# Updates all the npm dependencies used in the "backend" service
boostr backend update
```

### `boostr [<service>] check [options]`

Checks the TypeScript code of your app (or a specified service).

Under the hood, this command runs `tsc --noEmit`.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Checks the TypeScript code of your app
boostr check
```

```sh
# Checks the TypeScript code of the "backend" service
boostr backend check
```

### `boostr [<service>] build [options]`

Builds runnable artifacts from the source code of your app (or a specified service).

Under the hood, this command runs `tsc --noEmit`.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Builds runnable artifacts from the source code of your app
boostr build
```

```sh
# Builds runnable artifacts from the source code of the "frontend" service
boostr frontend build
```

```sh
# Builds runnable artifacts from the source code of your app while using
# the "production" stage configuration
boostr build --production
```

### `boostr [<service>] test [options]`

Tests all the services of your app (or a specified service) in development mode.

Under the hood, this command executes `npm test`.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Tests all the services of your app
boostr test
```

```sh
# Tests the "backend" service
boostr backend test
```

### `boostr [<service>] start [options]`

Starts your app (or a specified service) in development mode.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Starts all the services of your app in development mode
boostr start
```

```sh
# Starts the "backend" service (and the services it depends on)
# in development mode
boostr backend start
```

### `boostr [<service>] migrate [options]`

Migrates one or more databases used by your app.

Note that database migrations are limited to [MongoDB](https://www.mongodb.com/) for now.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Migrates all the databases used by your app in the "development" environment
boostr migrate
```

```sh
# Migrates all the databases used by your app in the "staging" environment
boostr migrate --staging
```

```sh
# Migrates the "customers" database in the "development" environment
boostr customers migrate
```

### `boostr [<service>] deploy [options]`

Deploys your app (or a specified service) to the specified stage.

#### Options

In addition to the [global options](#global-options), the `deploy` command accepts the following option:

- `--skip`: Skips the specified service when deploying. Note that you can repeat this option several times to skip multiple services.

#### Notes

- Currently, only [AWS](https://aws.amazon.com/) is supported as a deployment target.
- The DNS associated with your domain name must be managed by [Amazon Route 53](https://aws.amazon.com/route53/).
- The first deployment may take a while because several AWS services have to be set up, but subsequent deployments should be much faster.

#### Examples

```sh
# Deploys all the services of your app to the "production" stage
boostr deploy --production

# Does the same thing
boostr deploy --stage=production
```

```sh
# Deploys the "backend" service (and the services it depends on)
# to the "production" stage
boostr backend deploy --production
```

```sh
# Deploys all the services of your app to the "staging" stage while
# skipping the "legacyBackend" service
boostr deploy --staging --skip=legacyBackend
```

### `boostr [<service>] config [options]`

Displays the root (or a specified service) configuration.

Note that the displayed configuration considers all the property references and resolves them according to a specific stage ("development" by default).

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Displays the root configuration for the "development" environment
boostr config
```

```sh
# Displays the configuration of the "frontend" service for the "development" environment
boostr frontend config
```

```sh
# Displays the configuration of the "backend" service for the "production" environment
boostr backend config --production
```

### `boostr [<service>] exec [options] -- <command> ...`

Executes any shell command in the root directory of your app (or in the directory of a specified service).

Note that the configuration environment variables are propagated to the shell command.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Executes `npx prettier --check .` in the root directory of your app
boostr exec -- npx prettier --check .
```

```sh
# Executes `npm install lodash` in the directory of the "backend" service
boostr backend exec -- npm install lodash
```

```sh
# Executes `npm version patch --no-git-tag-version` in the directory of
# the "frontend" service
boostr frontend exec -- npm version patch --no-git-tag-version
```

```sh
# Executes `npm run myscript` in the directory of the "backend" service
# with the environment variables of the "production" stage
boostr backend exec --stage=production -- npm run myscript
```

## Global Options

The following options are available for all the commands:

- `--stage`: Selects a stage. See ["Stages"](#stages) for details.
- `--development`: A shorthand for `--stage=development`.
- `--staging`: A shorthand for `--stage=staging`.
- `--production`: A shorthand for `--stage=production`.
- `--version`, `-v`: Displays the current Boostr version.
- `--help`, `-h`: Displays inline help. See ["Inline Help"](#inline-help) for details.

## Contributing

Contributions are welcome.

Before contributing please read the [code of conduct](https://github.com/boostrjs/boostr/blob/master/CODE_OF_CONDUCT.md) and search the [issue tracker](https://github.com/boostrjs/boostr/issues) to find out if your issue has already been discussed before.

To contribute, [fork this repository](https://docs.github.com/en/github/getting-started-with-github/fork-a-repo/), commit your changes, and [send a pull request](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-requests).

## License

MIT
