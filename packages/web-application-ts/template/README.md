# {{projectName}}

## Prerequisites

- Make sure you have [Node.js](https://nodejs.org/) v14 or newer installed.
- Make sure you have [Boostr](https://boostr.dev/) v2 installed. Boostr is used to manage the development environment.
- If you want to deploy your app to AWS, make sure you have [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) installed and some [AWS credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) properly set up.

## Installation

After cloning the repository, install all the npm dependencies with the following command:

```sh
boostr install
```

## Development

### Configuration

- In the `backend` directory, duplicate the `boostr.config.private-template.mjs` file, name it `boostr.config.private.mjs`, and modify it to set all the required private development environment variables.

### Migrating the database

Migrate the database with the following command:

```sh
boostr database migrate
```

### Starting the development environment

Start the development environment with the following command:

```sh
boostr start
```

The web app should be available at http://localhost:{{frontendPort}}.

## Staging

### Configuration

- In the `backend` directory, modify the `boostr.config.private.mjs` file to set all the required private staging environment variables.
- In the `database` directory, modify the `boostr.config.private.mjs` file to set the `stages.staging.url` attribute to the URL of your staging MongoDB database.

### Migrating the database

Migrate the database with the following command:

```sh
boostr database migrate --staging
```

### Deploying the app

Deploy the app to your staging environment with the following command:

```sh
boostr deploy --staging
```

The web app should be available at https://staging.example.com/.

## Production

### Configuration

- In the `backend` directory, modify the `boostr.config.private.mjs` file to set all the required private production environment variables.
- In the `database` directory, modify the `boostr.config.private.mjs` file to set the `stages.production.url` attribute to the URL of your production MongoDB database.

### Migrating the database

Migrate the database with the following command:

```sh
boostr database migrate --production
```

### Deploying the app

Deploy the app to production with the following command:

```sh
boostr deploy --production
```

The web app should be available at https://example.com/.
