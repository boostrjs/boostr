export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://localhost:13395/dev',
      platform: 'local'
    }
  }
});
