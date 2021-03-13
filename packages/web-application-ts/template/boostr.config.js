export default () => ({
  type: 'application',

  components: {
    frontend: './frontend',
    backend: './backend',
    database: './database'
  },

  environment: {
    // Put global environment variables here
  }
});
