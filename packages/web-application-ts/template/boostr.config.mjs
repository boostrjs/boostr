export default () => ({
  type: 'application',

  services: {
    frontend: './frontend',
    backend: './backend',
    database: './database'
  },

  environment: {
    APPLICATION_NAME: 'Boostr Application'
  }
});
