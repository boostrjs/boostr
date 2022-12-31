export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://localhost:14128/dev',
      platform: 'local'
    }
  }
});
