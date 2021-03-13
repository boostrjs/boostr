export default ({components}) => ({
  type: 'backend',

  environment: {
    FRONTEND_URL: components.frontend.url,
    MONGODB_STORE_CONNECTION_STRING: components.database.url
  },

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
