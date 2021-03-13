export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://dev:dev@localhost:{{databasePort}}/dev',
      createLocalDatabase: true
    }
  }
});
