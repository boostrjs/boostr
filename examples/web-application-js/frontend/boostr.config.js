export default () => ({
  type: 'web-frontend',

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
