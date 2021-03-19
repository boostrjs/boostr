export default ({services}) => ({
  type: 'web-frontend',

  dependsOn: 'backend',

  environment: {
    BACKEND_URL: services.backend.url
  },

  stages: {
    development: {
      url: 'http://localhost:{{frontendPort}}/',
      platform: 'local'
    },
    production: {
      url: 'https://example.com/',
      platform: 'aws',
      region: 'us-east-1',
      cloudFront: {
        priceClass: 'PriceClass_100'
      }
    }
  }
});
