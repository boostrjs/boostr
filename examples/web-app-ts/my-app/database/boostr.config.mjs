export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://localhost:19093/dev',
      platform: 'local'
    }
  }
});
