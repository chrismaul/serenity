var async = require("async"),
  winston = require('winston');
module.exports = function(dbDriver) {
  var api = {};

  api.setSiteConfig = function(site,config,done) {
    async.waterfall(
      [
        function(next) {
          dbDriver.openDb(next);
        },
        function(next) {
          dbDriver.db.view("site","by_host",
            {
              key: site
            },
            next
          );
        },
        function(body,info,next) {
          var siteConfig;
          if(body.rows.length > 0 ) {
            siteConfig = body.rows[0].value;
          } else {
            siteConfig = {type:"site",host:site};
          }
          ["router","deployConfig"].forEach(function(item) {
            siteConfig[item] = config[item];
          });
          winston.info("saving site configuration", siteConfig);
          dbDriver.db.insert(siteConfig,next);
        },
        function(body,info,next) {
          next();
        }
      ], done
    );
  };

  return api;
};
