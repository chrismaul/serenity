var _ = require("underscore");
module.exports = function(target,options) {
  if( ! target && options.config.nodes ) {
    target = _.sample(
      options.config.nodes.filter(function(item) {
        return !_.contains(options.blacklist,item);
      })
    );
    if(!target) {
      target = _.sample(options.config.nodes);
    }
  }
  return target;
}