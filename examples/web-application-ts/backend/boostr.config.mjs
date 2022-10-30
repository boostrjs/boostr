export default ({services}) => ({
  type: 'backend',

  dependsOn: 'database',

  environment: {
    FRONTEND_URL: services.frontend.url,
    BACKEND_URL: services.backend.url,
    DATABASE_URL: services.database.url
  },

  stages: {
    development: {
      url: 'http://localhost:16782/',
      platform: 'local'
    },
    production: {
      url: 'https://backend.web-application-ts.boostr.dev/',
      platform: 'aws',
      aws: {
        region: 'ap-southeast-1',
        lambda: {
          memorySize: 1024
        }
      }
    }
  }
});
