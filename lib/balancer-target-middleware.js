var _ = require("underscore");

module.exports = function(target,options) {
  var newTarget = target;

  function getBalanceTarget() {
    var balanceTarget;
    options.config.nodes.forEach(function(node) {
      if( options.config.balance[node] && ! balanceTarget &&
        !_.contains(options.blacklist,node) ) {
        if( ! options.data.balance[node] ) {
          options.data.balance[node] = 0;
        }
        if( options.data.balance[node] < options.config.balance[node] ) {
          options.data.balance[node]++;
          balanceTarget = node;
        }
      }
    });
    return balanceTarget;
  }


  if( ! target && options.config.balance && options.config.nodes ) {
    if( ! options.data.balance ) {
      options.data.balance = {};
    }
    newTarget = getBalanceTarget();
    // don't get a new target means it time to restart the counter
    if(!newTarget) {
      options.data.balance = {};
      newTarget = getBalanceTarget();
    }
  }
  return newTarget;
};