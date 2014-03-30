var targetController = require("./target-controller"),
  fallbackTargetMiddleware = require("./fallback-target-middleware"),
  balancerTargetMiddleware = require("./balancer-target-middleware"),
  featureRouterMiddleware = require("./feature-router-middleware"),
  siteManager = require("./site-manager"),
  crossroads = require("crossroads"),
  url = require("url"),
  winston = require('winston'),
  _ = require("underscore");

module.exports = function(dbDriver) {
  var api = {},
    data = {},
    config = {},
    blacklist = {},
    siteManagers = {},
    controller = targetController(),
    featureController = targetController(),
    urlMatcher = {};
  api.config = config;
  api.data = data;
  api.blacklist = blacklist;
  
  api.featureData = {};
  api.featureConfig = {};
  Object.defineProperties(api, {
    controller: {
      value:controller,
      writable:false
    }
  });
  controller.add(featureRouterMiddleware);
  controller.add(balancerTargetMiddleware);
  controller.add(fallbackTargetMiddleware);
  featureController.add(balancerTargetMiddleware);
  featureController.add(fallbackTargetMiddleware);


  api.setUrlMatcher = function(site,config) {
    var newUrlMatcher = crossroads.create();
    newUrlMatcher.ignoreState = true;
    newUrlMatcher.greedy = true;
    _.each(config,function(data,route) {
      newUrlMatcher.addRoute(route,function(options) {
        var setVariables = true;
        if(data.feature && options[0].features) {
          setVariables = _.contains(options[0].features, 
            data.feature);
        }
        if(setVariables) {
          _.each(data,function(value,key) {
            var optionValue;
            if(!(key === "features")) {
              optionValue = value;
              if(key === "url") {
                optionValue =_.template(value,{ 
                    options:options, 
                    feature:data.feature 
                  },
                  {
                    evaluate:false,
                    interpolate: /\{\{(.+?)\}\}/g
                  }
                );

              }
              if(optionValue !== undefined) {
                options[0][key] = optionValue;
              }
            }
          });
        }
      });
    });
    urlMatcher[site] = newUrlMatcher;
  };

  api.executeRoutes = function(site,url,options) {
    if(urlMatcher[site]) {
      urlMatcher[site].parse(url,[options]);
    }
  };

  api.addRequest = function(host,requestData) {
    siteManagers[host].addRequest(requestData);
  };

  api.makeSiteManager = function(host) {
    if(!siteManagers[host]) {
      winston.info("making manager",host);
      siteManagers[host] = siteManager({
        site:host,
        db:dbDriver,
        router:api
      });
    }
  };

  api.getFeature = function(host) {
    return featureController.getTarget(api.featureConfig[host],
      api.featureData[host], [],{});
  };

  api.getTarget = function(host, options) {
    var target = {},
      retry,
      targetInfo,
      deployRoute,
      retryMax = 5;
    if(!host) {
      return;
    }
    if(!options) {
      options = {};
    }
    if(!options.tempBlacklist) {
      tempBlacklist = [];
    } else {
      tempBlacklist = options.tempBlacklist;
    }
    api.makeSiteManager(host);
    [data,config,blacklist].forEach(function(item) {
      if( !item[host] ) {
        if(item !== blacklist) {
          item[host] = {};
        } else {
          item[host] = [];
        }
      }
    });
    for( retry = 0; retry < retryMax && ! targetInfo; retry++ ) {
      deployRoute = controller.getTarget(config[host],data[host],
        blacklist[host].concat(tempBlacklist),options);
      targetInfo = siteManagers[host].getTarget(target,options);
    }
    if(targetInfo) {
      target.addr = targetInfo.addr;
      target.node = targetInfo.node;
    }
    target.target = deployRoute;
    return target;
  };
  return api;
}
