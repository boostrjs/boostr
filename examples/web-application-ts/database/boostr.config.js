export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://dev:dev@localhost:34567/myApp',
      createLocalDatabase: true
    }
  }
});
