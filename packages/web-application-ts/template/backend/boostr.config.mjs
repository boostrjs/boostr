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
      url: 'http://localhost:{{backendPort}}/',
      platform: 'local'
    },
    staging: {
      url: 'https://staging.backend.example.com/',
      platform: 'aws',
      aws: {
        region: 'us-east-1',
        lambda: {
          memorySize: 1024
        }
      }
    },
    production: {
      url: 'https://backend.example.com/',
      platform: 'aws',
      aws: {
        region: 'us-east-1',
        lambda: {
          memorySize: 1024
        }
      }
    }
  }
});
