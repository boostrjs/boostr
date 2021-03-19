export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://localhost:{{databasePort}}/dev',
      platform: 'local'
    }
  }
});
