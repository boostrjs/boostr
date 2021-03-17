export default ({services}) => ({
  type: 'web-frontend',

  environment: {
    BACKEND_URL: services.backend.url
  },

  stages: {
    development: {
      url: 'http://localhost:{{frontendPort}}/'
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
