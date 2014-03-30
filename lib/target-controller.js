var _ = require("underscore");
module.exports = function() {
  var api = {},
    targetMiddleware = [];

  api.add = function(middleware) {
    targetMiddleware.push(middleware);
  };

  api.getTarget = function(config, data, blacklist,options) {
    var target,
      options = {};
    Object.defineProperties(options, {
      config: {
        value: config,
        writable: false
      },
      data: {
        value:data,
        writable: true
      },
      blacklist: {
        value: _.clone(blacklist) || [],
        writable: true
      },
      options: {
        value: options,
        writable: false
      }
    });
    targetMiddleware.forEach(function(middleware) {
      target = middleware(target,options);
    });
    return target;
  };
  Object.defineProperties(api,{
    middleware: {
      value:targetMiddleware,
      writable:false
    }
  });
  return api;
};