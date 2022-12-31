export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://localhost:18466/dev',
      platform: 'local'
    }
  }
});
