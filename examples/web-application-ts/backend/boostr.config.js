export default ({services}) => ({
  type: 'backend',

  environment: {
    FRONTEND_URL: services.frontend.url,
    MONGODB_STORE_CONNECTION_STRING: services.database.url
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
