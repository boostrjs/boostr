export default () => ({
  type: 'database',

  stages: {
    development: {
      url: 'mongodb://localhost:13295/dev',
      platform: 'local'
    }
  }
});
