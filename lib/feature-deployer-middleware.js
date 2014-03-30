var _ = require("underscore");

module.exports = function(deployManager) {
  return function(target,options) {
    if(options.options.featureFlag) {
      _.each(api.getActiveNodes(), function(node, nodeName) {
        if(node.features) {
          if(!_.contains(node.features,options.options.featureFlag)) {
            options.blacklist.push(nodeName);
          }
        }
      });
    }
    return target;
  };
};