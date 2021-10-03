export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://localhost:16783/dev',
      platform: 'local'
    }
  }
});
