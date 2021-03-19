export default ({services}) => ({
  type: 'backend',

  environment: {
    FRONTEND_URL: services.frontend.url,
    DATABASE_URL: services.database.url
  },

  stages: {
    development: {
      url: 'http://localhost:{{backendPort}}/',
      platform: 'local'
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
