export default () => ({
  stages: {
    staging: {
      url:
        'mongodb+srv://user:pass@clusterNane.mongodb.net/exampleStaging?retryWrites=true&w=majority'
    },
    production: {
      url:
        'mongodb+srv://user:pass@clusterNane.mongodb.net/exampleProduction?retryWrites=true&w=majority'
    }
  }
});
