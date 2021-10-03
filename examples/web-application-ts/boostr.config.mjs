export default () => ({
  type: 'application',

  name: 'Boostr Application',
  description: 'An example application built with Boostr',

  services: {
    frontend: './frontend',
    backend: './backend',
    database: './database'
  },

  environment: {
    // Put global environment variables here
  },

  stages: {
    production: {
      environment: {
        NODE_ENV: 'production'
      }
    }
  }
});
