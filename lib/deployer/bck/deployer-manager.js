var targetController = require("../target-controller"),
  fallbackTargetMiddleware = require("../fallback-target-middleware"),
  balancerTargetMiddleware = require("../balancer-target-middleware"),
  _ = require("underscore");

module.exports.base = function(options, deployer) {
  var api = {},
    nodes = {},
    controllerData = {},
    blacklist = [],
    controllerConfig = {},
    controller = targetController();

  controller.add(balancerTargetMiddleware);
  controller.add(fallbackTargetMiddleware);
  nodes.active = {};

  function getSiteNodes( basename, version ) {
    var siteNodes = [];
    _.each(nodes, function(statusNodes) {
      _.where(_.values(statusNodes),
        {
          siteName:basename,
          version:version
        }
      ).forEach(function(item) {
        siteNodes.push(item);
      });
    });
    return siteNodes;
  }

  function getSiteCount( basename, version ) {
    var siteNodes = getSiteNodes(basename,version);
    return siteNodes.length;
  }

  function updateRoute() {
    controllerConfig.nodes = Object.keys(nodes.active);
    controllerConfig.balance = {};
    controllerConfig.nodes.forEach(function(item) {
      controllerConfig.balance[item] = 1;
    });
  }

  api.deleteNode = function(name) {
    _.each(nodes, function(statsNodes) {
      if( statsNodes[name] ) {
        delete statsNodes[name];
      }
    });
    updateRoute();
  }

  api.setNodeState = function(name,status,options) {
    var nodeOptions = _.clone(options);
    _.each(nodes, function(statsNodes,nodeStatus) {
      if( statsNodes[name] ) {
        if(nodeStatus !== status) {
          nodeOptions = _.extend(statsNodes[name],nodeOptions);
          delete statsNodes[name];
        }
      }
    });
    if ( ! nodes[status] ) {
      nodes[status] = {};
    }
    nodeOptions.name = name;
    nodes[status][name] = nodeOptions;
    updateRoute();
  }

  api.testAndDeploy = function(name, params, opts, done ) {
    var retry = 0,
      retryCount = 4,
      deployed = false;
    async.whilst(
      function() {
        return retry < retryCount && ! deployed;
      },
      function(next) {
        retry++;
        deployer.deployInstance(params.code,name,opts,
          function(error,url) {
            deployed = true;
            if(error) {
              deployed = false;
              return deployer.deleteIntance(name,next);
            } else if(params.test) {
              params.test(name, params, opts ,function(fail) {
                if(fail) {
                  deployed = false;
                  return deployer.deleteIntance(name,next);
                } else {
                  api.setNodeState(name,"active",{});
                  return next();
                }
              });
            } else {
              api.setNodeState(name,"active",{});
              next();
            }
          }
        );
      },
      done
    );
  }
  return api;

}