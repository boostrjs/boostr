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

- App templates so you can bootstrap an app with a single command
- Fully managed local development environment:
  - Automatic frontend build and refresh
  - Automatic backend build and restart
  - Local development database (limited to [MongoDB](https://www.mongodb.com/) for now)
- Configuration management:
  - Environment variables with inheritance and cross-service references
  - Multiple stages (e.g., `'development'`, `'staging'`, and `'production'`)
  - Public and private configurations
- Database migrations (limited to [MongoDB](https://www.mongodb.com/) for now)
- Serverless deployment with a single command (limited to [AWS](https://aws.amazon.com/) for now)

## Getting Started

### Installation

```sh
npm install --global boostr
```

> **Note**: Installing an NPM package globally is usually not recommended. But it's not a problem in this case because each app managed by Boostr uses a local Boostr package which is automatically installed. So the global Boostr package can be seen as a shortcut to the local Boostr packages installed in your apps, and, therefore, you can have different apps using different versions of Boostr.

### Creating a Layr App

Boostr provides an `initialize` command to bootstrap an app from a template.

For example, you can bootstrap a Layr web app using TypeScript with the following commands:

```sh
mkdir my-app
cd my-app
boostr initialize @boostr/web-app-ts
```

Check out the [`initialize`](#boostr-initialize-template-options) command for details.

### Starting a Layr App

You can start your app in development mode with the following command:

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

The last line should provide an URL you can open in a browser to display your app.

Check out the [`start`](#boostr-service-start-options) command for details.

### Deploying a Layr App

First, make sure that your frontend and backend Boostr configuration files (`frontend/boostr.config.mjs` and `backend/boostr.config.mjs`) specify the URLs you want to use for your app.

So, if you just created a web app with the [`initialize`](#boostr-initialize-template-options) command, replace all the occurrences of `'example.com'` with your domain name (e.g., `'awesome.app'`) or subdomain name (e.g., `'project1.awesome.app'`).

Then, run the following command to deploy your app to production:

```
boostr deploy --production
```

Check out the [`deploy`](#boostr-service-deploy-options) command for details.

## Configuration Files

A Layr app managed by Boostr is usually composed of different services, and each service is associated with a configuration file named `boostr.config.mjs`.

For example, a typical web app comprises the following directories and files:

- `boostr.config.mjs`: [Application service](#application-service) configuration file (also called "root configuration file").
- `frontend`:
  - `boostr.config.mjs`: [Web-frontend service](#web-frontend-service) configuration file.
- `backend`:
  - `boostr.config.mjs`: [Backend service](#backend-service) configuration file.
- `database`:
  - `boostr.config.mjs`: [Database service](#database-service) configuration file.

> **Note**: The name of the directories (e.g., `frontend`, `backend`, `database`) are specified in the root configuration file, so they can be anything you want.

Any configuration file is a JavaScript ESM module exporting a function (as `default` export) which should return a plain object representing the configuration.

Here's an example of a simple root configuration file:

```js
export default () => ({
  type: 'application',

  services: {
    frontend: './frontend',
    backend: './backend',
    database: './database'
  }
});
```

The `type` property specifies a string representing the type of the service and is required for each configuration file. In the case of a root configuration file, the value of `type` should be `'application`'.

The `services` property specifies an object allowing to match the name of the services used by the app with the path of the directories containing these services.

### Application Service

The application service (also called "root service") is represented by a configuration file that specifies all the services used by your app and some general properties such as [environment](#environment-variables) and [stages](#stages).

Here's an example of an application service configuration file:

```js
// boostr.config.mjs

export default () => ({
  type: 'application',

  services: {
    frontend: './frontend',
    backend: './backend',
    database: './database'
  },

  environment: {
    APPLICATION_NAME: 'Layr App',
    APPLICATION_DESCRIPTION: 'A Layr app managed by Boostr.'
  },

  stages: {
    staging: {
      environment: {
        NODE_ENV: 'production'
      }
    },
    production: {
      environment: {
        NODE_ENV: 'production'
      }
    }
  }
});
```

The object returned by the exported function contains the following properties:

- `type`: Specifies the type of service, which should always be `'application'` in the case of an application service.
- `services`:
  - `frontend`: Specifies the directory's path (`./frontend`) of a web-frontend service simply named `'frontend'`.
  - `backend`: Specifies the directory's path (`./backend`) of a backend service incidentally named `'backend'`.
  - `database`: Specifies the directory's path (`./database`) of a database service incidentally named `'database'`.
- `environment`: An object allowing you to define some global [environment variables](#environment-variables).
- `stages`:
  - `staging`: An object allowing you to define some properties when the `'staging'` [stage](#stages) is used.
  - `production`: An object allowing you to define some properties when the `'production'` [stage](#stages) is used.

### Web-Frontend Service

A web-frontend service is represented by a configuration file that specifies some properties related to the nature of a web frontend and some general properties, such as [environment](#environment-variables), [stages](#stages), and [dependsOn](#service-dependencies).

Here's an example of a web-frontend service configuration file:

```js
// frontend/boostr.config.mjs

export default ({services}) => ({
  type: 'web-frontend',

  dependsOn: 'backend',

  environment: {
    FRONTEND_URL: services.frontend.url,
    BACKEND_URL: services.backend.url
  },

  rootComponent: './src/index.ts',

  html: {
    language: 'en',
    head: {
      title: services.frontend.environment.APPLICATION_NAME,
      metas: [
        {
          name: 'description',
          content: services.frontend.environment.APPLICATION_DESCRIPTION
        },
        {charset: 'utf-8'},
        {name: 'viewport', content: 'width=device-width, initial-scale=1'},
        {'http-equiv': 'x-ua-compatible', 'content': 'ie=edge'}
      ],
      links: [
        {
          rel: 'icon',
          href: '/boostr-favicon-3NjLR7w1Mu8UAIqq05vVG3.immutable.png'
        }
      ]
    }
  },

  stages: {
    development: {
      url: 'http://localhost:10742/',
      platform: 'local'
    },
    staging: {
      url: 'https://staging.example.com/',
      platform: 'aws',
      aws: {
        region: 'us-east-1',
        cloudFront: {
          priceClass: 'PriceClass_100'
        }
      }
    },
    production: {
      url: 'https://example.com/',
      platform: 'aws',
      aws: {
        region: 'us-east-1',
        cloudFront: {
          priceClass: 'PriceClass_100'
        }
      }
    }
  }
});
```

The object returned by the exported function contains the following properties:

- `type`: Specifies the type of service, which should always be `'web-frontend'` in the case of a web-frontend service.
- `dependsOn`: Specifies that the `'frontend'` service depends on the `'backend'` service. See ["Service Dependencies"](#service-dependencies) for details.
- `environment`: An object allowing you to define some [environment variables](#environment-variables) specific to the `'frontend'` service. Note that `'FRONTEND_URL'` and `'BACKEND_URL'` are determined according to some service properties fetched from the `services` parameter of the configuration function. See ["Service Property References"](#service-property-references) for a detailed explanation.
- `rootComponent`: Specifies the file's path implementing the root Layr component of your web frontend.
- `html`: An object allowing you to customize the `index.html` file automatically generated by Boostr. See ["Autogenerated `index.html` File"](#autogenerated-indexhtml-file) for details.
- `stages`:
  - `development`: An object allowing you to define some properties when the `'development'` [stage](#stages) is used.
    - We define the `url` property so you can access the web frontend locally (see ["Local Development URLs"](#local-development-urls) for details).
    - We set the value of the `platform` property to `'local'` to indicate that Boostr should manage a local frontend server.
  - `staging` and `production`: An object allowing you to define some properties when the `'staging'` or `'production'` [stage](#stages) is used.
    - We set the value of the `url` property to an URL where Boostr can deploy the web frontend (see ["Deployment URLs"](#deployment-urls) for details).
    - We set the value of the `platform` property to `'aws'` to indicate that Boostr should use [AWS](https://aws.amazon.com/) as a deployment target.
    - Optionally, we can specify an `aws` object to customize the AWS configuration (see ["Web-Frontend AWS Configuration"](#web-frontend-aws-configuration) for details).

#### Autogenerated `index.html` File

In the codebase of a Layr web app managed by Boostr, you will not see any `index.html` file because this file is autogenerated.

We made this choice so that Boostr could abstract away the execution environment (e.g., browser, [React Native](https://reactnative.dev/), or [Electron](https://www.electronjs.org/)) in which the app runs.

So, your app should be mainly composed of configuration files and Layr components.

However, in most cases, it is necessary to customize the `index.html` file so your web app can have, for example, a title and a favicon.

As seen in the [above example](#web-frontend-service), you can do so by setting the `html` property in your web-frontend service configuration file.

The `html` property should be an object composed of the following properties:

- `language`: A string specifying your web app's language (e.g., `'en'`). When the `index.html` file is autogenerated, this property determines the value of the `lang` attribute of the `<html>` tag (e.g., `<html lang="en">`).
- `head`:
  - `title`: A string specifying your web app's title (e.g., `'My Awesome App'`). When the `index.html` file is autogenerated, this property determines the content of the `<title>` tag in the `<head>` section (e.g., `<title>My Awesome App</title>`).
  - `metas`: An array of objects specifying the attributes of some `<meta>` tags to include in the `<head>` section of the autogenerated `index.html` file. See an example of use in the [above example](#web-frontend-service).
  - `links`: An array of objects specifying the attributes of some `<link>` tags to include in the `<head>` section of the autogenerated `index.html` file. See an example of use in the [above example](#web-frontend-service).
  - `style`: A string specifying the content of a `<style>` tag to include in the `<head>` section of the autogenerated `index.html` file. You can see an example of use in the web-frontend service [configuration file](https://github.com/layrjs/layr/blob/master/website/frontend/boostr.config.mjs) of the [Layr website](https://layrjs.com/).
  - `scripts`: An array of objects specifying the attributes of some `<script>` tags to include in the `<head>` section of the autogenerated `index.html` file. You can see an example of use in the web-frontend service [configuration file](https://github.com/layrjs/layr/blob/master/website/frontend/boostr.config.mjs) of the [Layr website](https://layrjs.com/).
- `body`:
  - `scripts`: An array of objects specifying the attributes of some `<script>` tags to include in the `<body>` section of the autogenerated `index.html` file.

#### Web-Frontend AWS Configuration

You can customize the AWS configuration of a web frontend by specifying an object containing the following properties:

- `region`: Specifies the AWS region (e.g., `'us-east-1'`) where the web frontend is deployed.
- `profile`: Specifies an [AWS configuration profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html) (e.g., `'my-company'`) used to get your AWS credentials. If not specified, your default AWS configuration profile is used.
- `accessKeyId`: Allows you to specify your AWS Access Key ID when the `profile` property is not used, or you don't have a default [AWS configuration profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html).
- `secretAccessKey`: Allows you to specify your AWS Secret Access Key when the `profile` property is not used, or you don't have a default [AWS configuration profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html).
- `cloudFront`:
  - `priceClass`: Specifies the Amazon CloudFront [price class](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PriceClass.html) to use (default: `'PriceClass_100'`).

### Backend Service

A backend service is represented by a configuration file that specifies some properties related to the nature of a backend and some general properties, such as [environment](#environment-variables), [stages](#stages), and [dependsOn](#service-dependencies).

Here's an example of a backend service configuration file:

```js
// backend/boostr.config.mjs

export default ({services}) => ({
  type: 'backend',

  dependsOn: 'database',

  environment: {
    FRONTEND_URL: services.frontend.url,
    BACKEND_URL: services.backend.url,
    DATABASE_URL: services.database.url
  },

  rootComponent: './src/index.ts',

  stages: {
    development: {
      url: 'http://localhost:10743/',
      platform: 'local'
    },
    staging: {
      url: 'https://staging.backend.example.com/',
      platform: 'aws',
      aws: {
        region: 'us-east-1',
        lambda: {
          memorySize: 1024
        }
      }
    },
    production: {
      url: 'https://backend.example.com/',
      platform: 'aws',
      aws: {
        region: 'us-east-1',
        lambda: {
          memorySize: 1024
        }
      }
    }
  }
});
```

The object returned by the exported function contains the following properties:

- `type`: Specifies the type of service, which should always be `'backend'` in the case of a backend service.
- `dependsOn`: Specifies that the `'backend'` service depends on the `'database'` service. See ["Service Dependencies"](#service-dependencies) for details.
- `environment`: An object allowing you to define some [environment variables](#environment-variables) specific to the `'backend'` service. Note that `'FRONTEND_URL'`, `'BACKEND_URL'`, and `'DATABASE_URL'` are determined according to some service properties fetched from the `services` parameter of the configuration function. See ["Service Property References"](#service-property-references) for a detailed explanation.
- `rootComponent`: Specifies the file's path implementing the root Layr component of your backend.
- `stages`:
  - `development`: An object allowing you to define some properties when the `'development'` [stage](#stages) is used.
    - We define the `url` property so the frontend can access the backend locally (see ["Local Development URLs"](#local-development-urls) for details).
    - We set the value of the `platform` property to `'local'` to indicate that Boostr should manage a local backend server.
  - `staging` and `production`: An object allowing you to define some properties when the `'staging'` or `'production'` [stage](#stages) is used.
    - We set the value of the `url` property to an URL where Boostr can deploy the backend (see ["Deployment URLs"](#deployment-urls) for details).
    - We set the value of the `platform` property to `'aws'` to indicate that Boostr should use [AWS](https://aws.amazon.com/) as a deployment target.
    - Optionally, we can specify an `aws` object to customize the AWS configuration (see ["Backend AWS Configuration"](#backend-aws-configuration) below for details).

#### Backend AWS Configuration

You can customize the AWS configuration of a backend by specifying an object containing the following properties:

- `region`: Specifies the AWS region (e.g., `'us-east-1'`) where the backend is deployed.
- `profile`: Specifies an [AWS configuration profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html) (e.g., `'my-company'`) used to get your AWS credentials. If not specified, your default AWS configuration profile is used.
- `accessKeyId`: Allows you to specify your AWS Access Key ID when the `profile` property is not used, or you don't have a default [AWS configuration profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html).
- `secretAccessKey`: Allows you to specify your AWS Secret Access Key when the `profile` property is not used, or you don't have a default [AWS configuration profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html).
- `lambda`:
  - `runtime`: Specifies the AWS Lambda [runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) to use (default: `'nodejs16.x'`).
  - `executionRole`: Specifies the [IAM role](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html) used when the [Lambda function](https://aws.amazon.com/lambda/) is executed. If not specified, an automatically created role (named `'boostr-backend-lambda-role-v2'`) will be used, allowing [Amazon CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html) management and [Lambda function](https://aws.amazon.com/lambda/) invocation.
  - `memorySize`: Specifies the [amount of memory](https://docs.aws.amazon.com/lambda/latest/operatorguide/computing-power.html) (in megabytes) available to the [Lambda function](https://aws.amazon.com/lambda/) at runtime (default: `128`).
  - `timeout`: Specifies the maximum time (in seconds) that the [Lambda function](https://aws.amazon.com/lambda/) can run (default: `10`).
  - `reservedConcurrentExecutions`: Specifies the number of [concurrent executions](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html) reserved for the [Lambda function](https://aws.amazon.com/lambda/) (default: `0`).

### Database Service

A database service is represented by a configuration file that specifies some properties related to the nature of a database and some general properties, such as [stages](#stages).

Here's an example of a database service configuration file:

```js
// database/boostr.config.mjs

export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://localhost:10744/dev',
      platform: 'local'
    }
  }
});
```

The object returned by the exported function contains the following properties:

- `type`: Specifies the type of service, which should always be `'database'` in the case of a database service.
- `stages`:
  - `development`: An object allowing you to define some properties when the `'development'` [stage](#stages) is used.
    - We define the `url` property so the backend can access the database locally (see ["Local Development URLs"](#local-development-urls) for details).
    - We set the value of the `platform` property to `'local'` to indicate that Boostr should manage a local database server.

You may wonder where are the URLs of the staging and production databases. Well, the problem is that we cannot put these URLs in `database/boostr.config.mjs` because they may contain sensitive information, such as access credentials.

Thankfully, we can add a [private configuration file](#private-configuration-files) to solve the issue:

```js
// database/boostr.config.private.mjs

export default () => ({
  stages: {
    staging: {
      url: 'mongodb+srv://user:pass@clusterNane.mongodb.net/exampleStaging?retryWrites=true&w=majority'
    },
    production: {
      url: 'mongodb+srv://user:pass@clusterNane.mongodb.net/exampleProduction?retryWrites=true&w=majority'
    }
  }
});
```

### Environment Variables

#### Defining Environment Variables

Using the `environment` object property, you can define environment variables in any configuration file.

For example, here's how you would define an `APPLICATION_NAME` environment variable in the root configuration:

```js
// boostr.config.mjs

export default () => ({
  // ...

  environment: {
    APPLICATION_NAME: 'Layr App'
  }

  // ...
});
```

Ahd here's how you would define an `APPLICATION_DESCRIPTION` environment variable in a web-frontend service configuration:

```js
// frontend/boostr.config.mjs

export default () => ({
  // ...

  environment: {
    APPLICATION_DESCRIPTION: 'A Layr app managed by Boostr.'
  }

  // ...
});
```

And finally, here's how you would define a `DATABASE_URL` environment variable in a backend service configuration:

```js
// backend/boostr.config.mjs

export default ({services}) => ({
  // ...

  environment: {
    DATABASE_URL: services.database.url
  }

  // ...
});
```

Note that the value of `'DATABASE_URL'` is determined according to a `'database'` service property fetched from the `services` parameter of the configuration function. See ["Service Property References"](#service-property-references) for a detailed explanation.

#### Global Environment Variables

The environment variables defined in the root configuration are global, and therefore, they are accessible from all the services of your app.

So, in the examples above, the web-frontend service has access to `APPLICATION_NAME` in addition to `APPLICATION_DESCRIPTION`, and the backend service has access to `APPLICATION_NAME` in addition to `DATABASE_URL`.

#### Accessing Environment Variables

You can access environment variables from your app's code via the `process.env` object.

For example, here's how you would get the value of `APPLICATION_NAME` from your frontend code:

```js
// frontend/src/components/application.jsx

// ...

class Application extends Base {
  @view() static HeaderView() {
    return <h1>{process.env.APPLICATION_NAME}</h1>;
  }
}
```

And here's how you would get the value of `DATABASE_URL` from your backend code:

```js
// backend/src/index.ts

// ...

const store = new MongoDBStore(process.env.DATABASE_URL);
```

Environment variables are also accessible when you run commands, such as [`test`](#boostr-service-test-options), [`eval`](#boostr-backend-service-eval-codetoeval-options), or [`repl`](#boostr-backend-service-repl-options).

For example, if you run the following command:

```sh
boostr backend eval process.env.APPLICATION_NAME
```

The terminal should output something like this:

```
[database] MongoDB server started at mongodb://localhost:14128/
[backend] Build succeeded (bundle size: 2.06MB)
[backend] Evaluating code...
[backend] Result:
[backend] "Layr App"
[database] MongoDB server stopped
```

### Stages

Generally, a Layr app managed by Boostr uses several stages, allowing you to define (or redefine) some configuration properties according to each stage.

For example, a typical app has the following stages:

- `'development'`: A stage used when you run your app in development mode on your local machine.
- `'staging'`: A stage used when you deploy your app to your staging hosting environment.
- `'production'`: A stage used when you deploy your app to production.

> **Note**: You can define as many stages as you want and name them according to your preferences. However, if you use unconventional stage names, you won't be able to use a shorthand option, such as `--staging` or `--production`, to [select a stage](#selecting-stages).

#### Defining Stages

Using the `stages` property, you can define stages in any configuration file.

The `stages` property should be an object composed of:

- Keys that represent the name of your stages.
- Values that allow you to define (or redefine) any configuration property according to each stage.

Here's an example of a root configuration file using the `stages` property to change the value of the global `APPLICATION_NAME` environment variable for the `'development'` and `'staging'` stages:

```js
// boostr.config.mjs

export default () => ({
  // ...

  environment: {
    APPLICATION_NAME: 'Layr App',
    APPLICATION_DESCRIPTION: 'A Layr app managed by Boostr.'
  },

  stages: {
    development: {
      environment: {
        APPLICATION_NAME: 'Layr App (development)'
      }
    },
    staging: {
      environment: {
        APPLICATION_NAME: 'Layr App (staging)'
      }
    }
  }
});
```

Note that in the example above:

- Since `APPLICATION_NAME` is not specified in a `'production`' stage, its value will be `'Layr App'` when the app is deployed to the `'production'` stage.
- Since `APPLICATION_DESCRIPTION` is not specified in any stage, its value will always be `'A Layr app managed by Boostr.'`.

#### Selecting Stages

When you run a Boostr command, you can use the `--stage` option to select a stage.

Alternatively, you can use one of the following shorthand options:

- `--development`: A shorthand for `--stage=development`.
- `--staging`: A shorthand for `--stage=staging`.
- `--production`: A shorthand for `--stage=production`.

> **Note**: The default stage is `'development'`, which will be used if you don't explicitly select another stage.

**Examples:**

```sh
# Starts the app while using the 'development' stage
boostr start --stage=development

# Since 'development' is the default stage, the following is equivalent
boostr start
```

```sh
# Deploys the app while using the 'production' stage
boostr deploy --stage=production

# Does the same thing by using the shorthand option
boostr deploy --production
```

### Service Dependencies

Using the `dependsOn` property, you can specify dependencies between the services of your Layr app.

So, for example, you can specify that a web-frontend service depends on a backend service, which itself depends on a database service.

When you start your app with the [`start`](#boostr-service-start-options) command, Boostr analyses the dependencies between your services and ensures that each dependency starts before each dependent.

So, in the example above, the services will start in the following order:

1. Database service
2. Backend service
3. Web-frontend service

The same logic applies to other commands, such as the [`deploy`](#boostr-service-deploy-options) command.

Here's an example showing how to specify a dependency between a web-frontend service and a backend service:

```js
// frontend/boostr.config.mjs

export default () => ({
  type: 'web-frontend',

  dependsOn: 'backend'

  // ...
});
```

And here's an example showing how to specify a dependency between a backend service and a database service:

```js
// backend/boostr.config.mjs

export default () => ({
  type: 'backend',

  dependsOn: 'database'

  // ...
});
```

### Service Property References

Using the `services` parameter of a configuration function, the services of your Layr app can reference each other.

This feature allows you to configure your app in a way that is 100% [DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself).

For example, let's take some configuration files:

```js
// boostr.config.mjs

export default () => ({
  type: 'application',

  services: {
    frontend: './frontend',
    backend: './backend'
  }
});
```

```js
// frontend/boostr.config.mjs

export default ({services}) => ({
  type: 'web-frontend',

  environment: {
    BACKEND_URL: services.backend.url
  },

  // ...

  stages: {
    development: {
      url: 'http://localhost:10742/',
      platform: 'local'
    }
  }
});
```

```js
// backend/boostr.config.mjs

export default ({services}) => ({
  type: 'backend',

  environment: {
    FRONTEND_URL: services.frontend.url
  },

  // ...

  stages: {
    development: {
      url: 'http://localhost:10743/',
      platform: 'local'
    }
  }
});
```

In the web-frontend service, the value of the `'BACKEND_URL'` environment variable is fetched from the backend service (incidentally named `'backend'` in the root configuration), which is accessible thanks to the `services` parameter of the configuration function.

You can see the same mechanism used in the backend service. The value of the `'FRONTEND_URL'` environment variable is fetched from the web-frontend service (simply named `'frontend'` in the root configuration).

Note that a service can even reference itself. For example, if, for some reason, you need a web-frontend service to be aware of its own URL through an environment variable, you can do so with the following configuration file:

```js
// frontend/boostr.config.mjs

export default ({services}) => ({
  type: 'web-frontend',

  environment: {
    FRONTEND_URL: services.frontend.url
  },

  // ...

  stages: {
    development: {
      url: 'http://localhost:10742/',
      platform: 'local'
    }
  }
});
```

### Local Development URLs

A local development URL looks like `'http://localhost:10742/'` for a web-frontend or backend service and `'mongodb://localhost:10744/dev'` for a database service.

When you initialize an app with the [`initialize`](#boostr-initialize-template-options) command, the TCP ports (e.g., `10742`) used for each service are randomly set. It ensures that you will never encounter port conflicts while working on several apps simultaneously.

### Deployment URLs

A deployment URL (e.g., `'https://example.com/'` or `'https://staging.example.com/'`) indicates where Boostr should deploy a service. Note that currently, the DNS associated with your base domain names (e.g., `'example.com'`) must be managed by [Amazon Route 53](https://aws.amazon.com/route53/).

## Private Configuration Files

Most apps use secrets that must remain private and never be included in your Git repositories (even if these repositories are private).

Your app configuration files should be included in your Git repositories and, therefore, cannot contain any secrets.

So how could you configure secrets without exposing them?

Boostr supports private configuration files that work like any configuration file but should be named `boostr.config.private.mjs` and stored next to your public configuration files named `boostr.config.mjs`.

Private configuration files are automatically excluded from Git thanks to a line (e.g., `*.private.*`) in a `.gitignore` file at the root of your repositories.

When Boostr evaluates your app's configuration, it reads both public and private configuration files and deeply merges them.

> **Note**: Private configurations precede public configurations, so a property found in a private configuration can override a property of the same name found in a public configuration.

### Example

Let's say your app implements an authentication mechanism using a [JWT library](https://jwt.io/libraries?language=Node.js) to sign and verify users' access tokens.

JWT relies on a secret that should be accessible from your backend. So, in your backend directory, you could specify this secret in a private configuration file next to your public configuration file.

Here's what your public configuration file would look like:

```js
// backend/boostr.config.mjs

export default () => ({
  type: 'backend',

  environment: {
    EMAIL_ADDRESS: 'hello@example.com'
  },

  // ...

  stages: {
    development: {
      // ...
    },
    production: {
      // ...
    }
  }
});
```

And here's what your private configuration file would look like:

```js
// backend/boostr.config.private.mjs

export default () => ({
  stages: {
    development: {
      environment: {
        JWT_SECRET: '26d9c27e799aba1b047ec16450a51418...'
      }
    },
    production: {
      environment: {
        JWT_SECRET: '537df3079d44e066bf0195433863ec34...'
      }
    }
  }
});
```

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

Get some help for a specific service (e.g., `'frontend'`) by running the following:

```sh
boostr frontend --help
```

Get some help for a command of a specific service (e.g., the `import` command of the `'database'` service) by running the following:

```sh
boostr database import --help
```

## Global Commands

The global commands are available for all services, including the root of your app, which is represented by a service of type `'application'`.

### `boostr initialize <template> [options]`

_Alias: `boostr init`_

Initializes your app within the current directory from the specified template.

The `<template>` argument specifies the template to use, which should be a published npm package.

Currently, two templates are available:

- `@boostr/web-app-js` for initializing a web app using JavaScript
- `@boostr/web-app-ts` for initializing a web app using TypeScript

We will publish more templates in the future. For example, some [React Native](https://reactnative.dev/) or [Electron](https://www.electronjs.org/) app templates should soon be available.

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

You can check out the outcome of the above example in the [Boostr repository](./examples/web-app-ts/my-app).

```sh
# Creates a web app named `my-awesome-app` using JavaScript
mkdir my-directory
cd my-directory
boostr init @boostr/web-app-js --name=my-awesome-app
```

You can check out the outcome of the above example in the [Boostr repository](./examples/web-app-js/my-directory).

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
# Installs all the npm dependencies used in the 'frontend' service
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
# Updates all the npm dependencies used in the 'backend' service
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
# Checks the TypeScript code of the 'backend' service
boostr backend check
```

### `boostr [<service>] build [options]`

Builds runnable artifacts from the source code of your app (or a specified service).

> **Note**: This command is automatically executed when you run some other commands, such as [`start`](#boostr-service-start-options) or [`deploy`](#boostr-service-deploy-options). So, unless you want to check out the built runnable artifacts for debugging purposes, you should not have to use the `build` command explicitly.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Builds runnable artifacts from the source code of your app
boostr build
```

```sh
# Builds runnable artifacts from the source code of the 'frontend' service
boostr frontend build
```

```sh
# Builds runnable artifacts from the source code of your app while using
# the 'production' stage configuration
boostr build --production
```

### `boostr [<service>] test [options]`

Tests all the services of your app (or a specified service) in development mode.

Under the hood, this command runs `npm test`.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Tests all the services of your app
boostr test
```

```sh
# Tests the 'backend' service
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
# Starts the 'backend' service (and the services it depends on)
# in development mode
boostr backend start
```

### `boostr [<service>] migrate [options]`

Migrates one or more databases used by your app.

> **Note**: Database migrations are limited to [MongoDB](https://www.mongodb.com/) for now.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Migrates all the databases used by your app in the 'development' environment
boostr migrate
```

```sh
# Migrates all the databases used by your app in the 'staging' environment
boostr migrate --staging
```

```sh
# Migrates the 'customers' database in the 'development' environment
boostr customers migrate
```

### `boostr [<service>] deploy [options]`

Deploys your app (or a specified service) to a specific [stage](#stages).

#### Options

In addition to the [global options](#global-options), the `deploy` command accepts the following option:

- `--skip`: Skips the specified service when deploying. Note that you can repeat this option several times to skip multiple services.

#### Notes

- Currently, only [AWS](https://aws.amazon.com/) is supported as a deployment target.
- The DNS associated with your base domain name must be managed by [Amazon Route 53](https://aws.amazon.com/route53/).
- The first deployment may take a while because several AWS services have to be set up, but subsequent deployments should be much faster.
- Boostr manages the deployment of the web-frontend and backend services, but the database services are not. So, you will have to set up the databases by yourself on some cloud services, such as [MongoDB Atlas](https://www.mongodb.com/atlas/database) or [Amazon DocumentDB](https://aws.amazon.com/documentdb/).

#### Examples

```sh
# Deploys all the services of your app to the 'staging' stage
boostr deploy --stage=staging

# Does the same thing by using the shorthand option
boostr deploy --staging
```

```sh
# Deploys all the services of your app to the 'production' stage
boostr deploy --stage=production

# Does the same thing by using the shorthand option
boostr deploy --production
```

```sh
# Deploys the 'backend' service (and the services it depends on)
# to the 'production' stage
boostr backend deploy --production
```

```sh
# Deploys all the services of your app to the 'staging' stage while
# skipping the 'legacyBackend' service
boostr deploy --staging --skip=legacyBackend
```

### `boostr [<service>] config [options]`

Displays the root (or a specified service) configuration.

> **Note**: The displayed configuration considers all the [property references](#service-property-references) and resolves them according to a specific [stage](#stages) (`'development'` by default).

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Displays the root configuration for the 'development' environment
boostr config
```

```sh
# Displays the configuration of the 'frontend' service for the 'development' environment
boostr frontend config
```

```sh
# Displays the configuration of the 'backend' service for the 'production' environment
boostr backend config --production
```

### `boostr [<service>] exec [options] -- <command> ...`

Executes any shell command in the root directory of your app (or in the directory of a specified service).

> **Note**: The [environment variables](#environment-variables) specified in your configuration are accessible from the executed shell command.

#### Options

See the [global options](#global-options).

#### Examples

```sh
# Executes `npx prettier --check .` in the root directory of your app
boostr exec -- npx prettier --check .
```

```sh
# Executes `npm install lodash` in the directory of the 'backend' service
boostr backend exec -- npm install lodash
```

```sh
# Executes `npm version patch --no-git-tag-version` in the directory of
# the 'frontend' service
boostr frontend exec -- npm version patch --no-git-tag-version
```

```sh
# Executes `npm run myscript` in the directory of the 'backend' service
# with the environment variables of the 'production' stage
boostr backend exec --stage=production -- npm run myscript
```

## Web-Frontend Commands

The web-frontend commands are available for all services of type `'web-frontend'`.

### `boostr <web-frontend-service> freeze`

Freezes all the files in your web-frontend service's `public` directory.

Freezing a file means that the file is renamed to match the pattern `<name>-<hash>.immutable.<extension>` where `<name>` is the original file name without its extension, `<hash>` is a hash generated from the contents of the file, and `<extension>` is the original file extension.

For example, if you have a file named `favicon.png` in the `public` directory of your `'frontend'` service, running `boostr frontend freeze` will rename the `favicon.png` file to something like `favicon-3NjLR7w1Mu8UAIqq05vVG3.immutable.png`.

When a browser loads a frozen file, it can permanently store it in its cache thanks to a `Cache-Control` header automatically added when your frontend is deployed.

> **Note**: It is not an issue to run the `freeze` command several times because the command is clever enough to ignore the files that have already been frozen.

## Backend Commands

The backend commands are available for all services of type `'backend'`.

### `boostr <backend-service> eval "<codeToEval>" [options]`

Evaluates the specified JavaScript code with your backend service root component exposed globally and outputs the result in the terminal.

#### Options

See the [global options](#global-options).

#### Example

If you run the following command with a web app that has just been initialized from the `@boostr/web-app-ts` template:

```sh
boostr backend eval "Application.isHealthy()"
```

The terminal should output something like this:

```
[database] MongoDB server started at mongodb://localhost:10744/
[backend] Build succeeded (bundle size: 2.06MB)
[backend] Evaluating code...
[backend] Result:
[backend] true
[database] MongoDB server stopped
```

### `boostr <backend-service> repl [options]`

Starts a Node.js [REPL](https://en.wikipedia.org/wiki/Read%E2%80%93eval%E2%80%93print_loop) with your backend root component exposed globally.

#### Options

See the [global options](#global-options).

#### Example

If you run the following command with a web app that has just been initialized from the `@boostr/web-app-ts` template:

```sh
boostr backend repl
```

Then, you should be able to execute the following JavaScript code inside the REPL:

```js
await Application.isHealthy();
```

And the REPL should output the following result:

```
true
```

## Global Options

The following options are available for most commands:

- `--stage`: Selects a stage. See ["Stages"](#stages) for details.
- `--development`: A shorthand for `--stage=development`.
- `--staging`: A shorthand for `--stage=staging`.
- `--production`: A shorthand for `--stage=production`.
- `--help`, `-h`: Displays inline help. See ["Inline Help"](#inline-help) for details.
- `--version`, `-v`: Displays the current Boostr version.

## Contributing

Contributions are welcome.

Before contributing please read the [code of conduct](https://github.com/boostrjs/boostr/blob/master/CODE_OF_CONDUCT.md) and search the [issue tracker](https://github.com/boostrjs/boostr/issues) to find out if your issue has already been discussed before.

To contribute, [fork this repository](https://docs.github.com/en/github/getting-started-with-github/fork-a-repo/), commit your changes, and [send a pull request](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-requests).

## License

MIT
