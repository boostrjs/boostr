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

## Basic Commands

Note that all commands accept some [global options](#global-options), and a few commands accept some specific options.

### `boostr initialize <template> [options]`

_Alias: `boostr init`_

Initializes an app from a template.

The `<template>` argument specifies the template to use, which should be a published npm package.

Currently, two templates are available:

- **@boostr/web-app-js** for initializing a web app using JavaScript
- **@boostr/web-app-ts** for initializing a web app using TypeScript

We will publish more templates in the future. For example, some React Native or Electron app templates should soon be available.

A template is simply an npm package. So, the community can publish any new template, and if needed, you can create some templates for your personal use.

#### Options

- `--name`: Specifies the name of your app (defaults to the name of the current directory).

#### Examples

Here is an example of initializing a web app using TypeScript from an empty directory named `my-app`:

```sh
boostr initialize @boostr/web-app-ts
```

Note that since we didn't use the `--name` option, the app will be named after the name of the current directory, which is `my-app`.

Here is an example of initializing a web app using JavaScript from an empty directory while specifying the name of the app:

```sh
boostr init @boostr/web-app-js --name=my-awesome-app
```

Note that we used the `--name` option to specify the app's name and shorted the command with the `init` alias.

### `boostr [<service>] start [options]`

Starts your app (or a specified service) in development mode.

TODO

### `boostr [<service>] deploy [options]`

Deploys your app (or a specified service) to a specific stage.

TODO

## Global Options

TODO

## Contributing

Contributions are welcome.

Before contributing please read the [code of conduct](https://github.com/boostrjs/boostr/blob/master/CODE_OF_CONDUCT.md) and search the [issue tracker](https://github.com/boostrjs/boostr/issues) to find out if your issue has already been discussed before.

To contribute, [fork this repository](https://docs.github.com/en/github/getting-started-with-github/fork-a-repo/), commit your changes, and [send a pull request](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-requests).

## License

MIT
