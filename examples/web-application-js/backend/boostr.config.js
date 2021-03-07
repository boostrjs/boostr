export default () => ({
  type: 'backend',

  stages: {
    development: {
      url: 'http://localhost:23456/'
    },
    production: {
      url: 'https://backend.myapp.com/',
      platform: 'aws',
      region: 'us-west-2',
      lambda: {
        memorySize: 1024,
        timeout: 15
      }
    }
  }
});
