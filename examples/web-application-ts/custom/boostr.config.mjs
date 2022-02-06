export default () => ({
  type: 'custom',

  stages: {
    development: {
      environment: {
        HELLO: 'Hello, World! (development)'
      }
    },
    production: {
      environment: {
        HELLO: 'Hello, World! (production)'
      }
    }
  }
});
