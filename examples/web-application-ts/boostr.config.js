export default () => ({
  type: 'application',

  components: {
    frontend: './frontend',
    backend: './backend',
    database: './database'
  },

  environment: {
    APPLICATION_NAME: 'My application'
  }
});
