export default ({components}) => ({
  type: 'web-frontend',

  environment: {
    BACKEND_URL: components.backend.url
  },

  stages: {
    development: {
      url: 'http://localhost:12345/'
    },
    production: {
      url: 'https://myapp.com/',
      platform: 'aws',
      region: 'us-west-2',
      cloudFront: {
        priceClass: 'PriceClass_100'
      }
    }
  }
});
