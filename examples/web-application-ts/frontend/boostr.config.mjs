export default ({application, services}) => ({
  type: 'web-frontend',

  dependsOn: 'backend',

  environment: {
    FRONTEND_URL: services.frontend.url,
    BACKEND_URL: services.backend.url
  },

  rootComponent: './src/index.ts',

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
      url: 'http://localhost:16781/',
      platform: 'local'
    },
    production: {
      url: 'https://web-application-ts.boostr.dev/',
      platform: 'aws',
      aws: {
        region: 'ap-southeast-1',
        cloudFront: {
          priceClass: 'PriceClass_100'
        }
      }
    }
  }
});
