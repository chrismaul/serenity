var async = require("async"),
  targetController = require("../target-controller"),
  featureDeployerMiddleware = require("../feature-deployer-middleware"),
  fallbackTargetMiddleware = require("../fallback-target-middleware"),
  balancerTargetMiddleware = require("../balancer-target-middleware"),
  codeDownloader = require("../code-downloader"),
  winston = require('winston'),
  nodeUuid = require("node-uuid"),
  _ = require("underscore");

module.exports.base = function(options, deployer) {
  var api = {},
    nodes = {},
    controllerData = {},
    blacklist = [],
    controllerConfig = {},
    deployName = options.deployName,
    site = options.site,
    controller = targetController(),
    maxTime = options.maxTime || 30,
    downloader = codeDownloader();

  api.remoteSync = options.remoteSync;
  api.remoteSync.registerManager(api);
  
  
  controller.add(featureDeployerMiddleware(api));
  controller.add(balancerTargetMiddleware);
  controller.add(fallbackTargetMiddleware);
  nodes.active = {};
  nodes.cleanup = {};

  api.syncNodes = function(callback) {
    api.remoteSync.syncNodes(callback);
  };

  api.getCleanupNodes = function( time ) {
    var nodesToCleanup = [];
    _.each(nodes.cleanup,function(node,nodeName) {
      if(node.cleanupTime <= time) {
        node.name = nodeName;
        nodesToCleanup.push(node);
      }
    });
    if(nodes.errorDelete) {
      nodesToCleanup = nodesToCleanup.concat(nodes.errorDelete);
    }
    return nodesToCleanup;
  };

  api.getScale = function( version ) {
    var scale = 0,
      siteNodes;
    siteNodes = api.getSiteNodes(version);
    siteNodes.forEach(function(node) {
      scale += node.scale || 1;
    });
    return scale;
  };

  api.getSiteNodes = function( version ) {
    var siteNodes = [];
    _.each(nodes, function(statusNodes, status) {
      if( ! (status === "cleanup" || status ===  "errorDelete" ) ) {
        _.each(statusNodes,function(node,nodeName) {
          if(node.version === version) {
            node.name = nodeName;
            node.status = status;
            siteNodes.push(node);
          }
        });
      }
    });
    return siteNodes;
  }

  api.getSiteVersions = function() {
    var versions = []
    _.each(nodes, function(statusNodes, status) {
      if( ! (status === "cleanup" || status ===  "errorDelete" ) ) {
        versions = versions.concat(_.pluck(statusNodes,"version"));
      }
    });
    return _.uniq(versions);
  }

  api.getActiveSiteVersions = function() {
    var versions = []
    versions = _.pluck(nodes.active,"version");
    return _.uniq(versions);
  }
  api.getNode = function(name) {
    var node;
    _.each(nodes, function(statsNodes,nodeStatus) {
      if( statsNodes[name] ) {
        node = _.clone(statsNodes[name]);
        node.status = nodeStatus;
      }
    });
    return node;
  };

  api.getSiteCount = function( version ) {
    var siteNodes = api.getSiteNodes(version);
    return siteNodes.length;
  }

  api.getActiveNodes = function() {
    return nodes.active;
  };

  function updateRoute() {
    controllerConfig.nodes = Object.keys(api.getActiveNodes());
    controllerConfig.balance = {};
    _.each(api.getActiveNodes(),function(value,item) {
      controllerConfig.balance[item] = value.balance || 1;
    });
  }

  api.deleteNode = function(name, done) {
    _.each(nodes, function(statsNodes) {
      if( statsNodes[name] ) {
        delete statsNodes[name];
      }
    });
    updateRoute();
    api.remoteSync.deleteNode(name,done);
  }

  api.setNodeState = function(name,status,options,done) {
    var nodeOptions = _.clone(options);
    _.each(nodes, function(statsNodes,nodeStatus) {
      if( statsNodes[name] ) {
        winston.info(nodeStatus,status);
        if(nodeStatus !== status) {
          nodeOptions = _.extend(statsNodes[name],nodeOptions);
          delete statsNodes[name];
        }
      }
    });
    if ( ! nodes[status] ) {
      nodes[status] = {};
    }
    if(!nodes[status][name]) {
      nodes[status][name] = {};
    }
    nodeOptions.name = name;
    nodes[status][name] = _.extend(nodes[status][name],nodeOptions);
    if(nodes[status][name].manager) {
      delete nodes[status][name].manager;
    }
    updateRoute();
    api.remoteSync.setNodeState(name,status,options,done);
  }

  api.importNodes = function(importNodes) {
    nodes = importNodes;
    updateRoute();
  };

  Object.defineProperties(api, {
    nodes: {
      value:nodes,
      writable:false
    }
  });

  api.testAndDeploy = function(name, params, done ) {
    var retry = 0,
      retryCount = 4,
      deployed = false,
      cloneParams = _.clone(params);
    cloneParams.manager = api;
    async.waterfall(
      [
        function(callback) {
          downloader.downloadCode(cloneParams,site,deployName,callback);
        },
        function(code,callback) {
          cloneParams.code = code;
          async.whilst(
            function() {
              return retry < retryCount && ! deployed;
            },
            function(next) {
              retry++;
              deployer.deployInstance(name,cloneParams,
                function(error,url) {
                  deployed = true;
                  if(error) {
                    deployed = false;
                    winston.info("deployed failed deleting instance",error);
                    return deployer.deleteIntance(name,{manager:api},next);
                  } else if(params.test) {
                    params.test(name, params, function(fail) {
                      if(fail) {
                        deployed = false;
                        winston.info("test failed deleting instance");
                        return deployer.deleteIntance(name,{manager:api},next);
                      } else {
                        return api.setNodeState(name,"active",{},next);
                      }
                    });
                  } else {
                    return api.setNodeState(name,"active",{},next);
                  }
                }
              );
            },
            callback
          );
        }
      ],done
    );
  };

  api.getTarget = function(options) {
    var target,
      node;
    if(!options) {
      options = {};
    }
    node = controller.getTarget(
      controllerConfig,controllerData,options.blacklist,options);
    if(node) {
      target = {};
      target.node = node;
      target.addr = api.transformTarget(target.node);
    }
    return target;
  };

  api.transformTarget = function(target) {
    return deployer.transformTarget(target,api);
  };

  api.getTime = function() {
    return Date.now();
  };

  api.destroyNode = function(name,done) {
    api.setNodeState(name,"cleanup",
      {
        cleanupTime:api.getTime() + (maxTime * 1000)
      },done);
  };
  api.cleanupNodes = function(done) {
    var nodesToCleanup = api.getCleanupNodes(api.getTime());
    async.eachSeries(nodesToCleanup,
      function(node,next) {
        deployer.deleteIntance(node.name,{manager:api},next);
      },
      done
    );

  };
  return api;
}

module.exports.multiApp = function(options, deployer) {
  var api = module.exports.base(options,deployer),
    deployName = options.deployName;

  function scaleUp( params, scale, done ) {
    var count = api.getSiteCount(params.version);
    async.whilst(
      function() {
        return count < scale;
      },
      function(callback) {
        var name = deployName+"-"+nodeUuid.v4();
        count++;
        api.testAndDeploy( name, params, callback );
      },
      done
    );
  }

  function scaleDown( version, scale, done ) {
    var count = api.getSiteCount(version);

    async.whilst(
      function() {
        return count > scale;
      },
      function(callback) {
        var siteNodes = api.getSiteNodes(version),
          node;
        count--;
        node = _.sample(siteNodes);
        api.destroyNode(node.name,callback);
      },
      done
    );
  };

  /*
   * params
   *  scale
   *  test
   *  code
   * opts
   *  version
   */

  api.deploy = function( params, done ) {
    var cloneParams = _.clone(params);
    cloneParams.manager = api;
    delete cloneParams.scale;
    scaleUp(cloneParams,params.scale,done);
  };

  api.scale = function( params, scale, done ) {
    var count = api.getSiteCount(params.version),
    cloneParams = _.clone(params);
    cloneParams.manager = api;
    if( count > scale ) {
      scaleDown( params.version, scale, done );
    } else if ( count < scale ) {
      scaleUp( cloneParams, scale, done );
    } else {
      done();
    }
  };

  api.destroy = function( version, done ) {
    winston.info("destroying",version);
    scaleDown(version,0,done);
  };

  api.redeployNode = function( name, done ) {
    var node = _.clone(api.getNode(name)),
      newNodeName;
    api.destroyNode(name,callback);
    newNodeName = deployName+"-"+nodeUuid.v4();
    api.testAndDeploy( newNodeName, node, done );
  };
  return api;
}

module.exports.singleApp = function(options, deployer) {

  var api = module.exports.base(options,deployer),
    deployName = options.deployName;
  /*
   * params
   *  scale
   *  test
   *  code
   *  version
   */

  api.deploy = function( params, done ) {
    winston.info("deploying",params);
    var cloneParams = _.clone(params);
    cloneParams.manager = api;
    api.testAndDeploy(deployName+"-"+cloneParams.version,cloneParams,done);
  };

  api.scale = function( params, scale, done ) {
    var scaleParams = _.clone(params);
    scaleParams.manager = api;
    scaleParams.name = deployName+"-"+scaleParams.version;
    deployer.scale(scaleParams,scale,done);
  };

  api.destroy = function( version, done ) {
    winston.info("destroying",version);
    api.destroyNode(deployName+"-"+version,done);
  };

  api.redeployNode = function( name, done ) {
    var node = _.clone(api.getNode(name)),
      newNodeName;
    api.destroyNode(name,callback);
    newNodeName = deployName+"-"+version+"-2";
    if(name === newNodeName ) {
      newNodeName = deployName+"-"+version;
    }
    api.testAndDeploy( newNodeName, node, done );
  };

  return api;
}

