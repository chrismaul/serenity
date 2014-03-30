var _ = require("underscore");

module.exports = function(target,options) {
  if(options.options.featureFlag) {
    _.each(options.config.features, function(features, deployName) {
      if(features) {
        if(!_.contains(features,options.options.featureFlag)) {
          options.blacklist.push(deployName);
        }
      }
    });
  }
  return target;
};