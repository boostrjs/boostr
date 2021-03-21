export default ({services}) => ({
  type: 'web-frontend',

  dependsOn: 'backend',

  environment: {
    BACKEND_URL: services.backend.url
  },

  iconURL: '/boostr-favicon-3NjLR7w1Mu8UAIqq05vVG3.immutable.png',

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
