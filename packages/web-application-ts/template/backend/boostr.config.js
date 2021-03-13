export default ({components}) => ({
  type: 'backend',

  environment: {
    FRONTEND_URL: components.frontend.url,
    DATABASE_URL: components.database.url
  },

  stages: {
    development: {
      url: 'http://localhost:{{backendPort}}/'
    },
    production: {
      url: 'https://backend.example.com/',
      platform: 'aws',
      region: 'us-east-1',
      lambda: {
        memorySize: 1024,
        timeout: 15
      }
    }
  }
});
