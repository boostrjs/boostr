export default ({application, services}) => ({
  type: 'web-frontend',

  dependsOn: 'backend',

  environment: {
    FRONTEND_URL: services.frontend.url,
    BACKEND_URL: services.backend.url
  },

  html: {
    language: 'en',
    head: {
      title: application.name,
      metas: [
        {name: 'description', content: application.description},
        {charset: 'utf-8'},
        {name: 'viewport', content: 'width=device-width, initial-scale=1'},
        {'http-equiv': 'x-ua-compatible', 'content': 'ie=edge'}
      ],
      links: [{rel: 'icon', href: '/boostr-favicon-3NjLR7w1Mu8UAIqq05vVG3.immutable.png'}]
    }
  },

  stages: {
    development: {
      url: 'http://localhost:13393/',
      platform: 'local'
    },
    staging: {
      url: 'https://staging.example.com/',
      platform: 'aws',
      aws: {
        region: 'us-east-1',
        cloudFront: {
          priceClass: 'PriceClass_100'
        }
      }
    },
    production: {
      url: 'https://example.com/',
      platform: 'aws',
      aws: {
        region: 'us-east-1',
        cloudFront: {
          priceClass: 'PriceClass_100'
        }
      }
    }
  }
});
