var async = require("async"),
  cloudfoundry = require("./deployer/cloudfoundry"),
  herokuDeployer = require("./deployer/heroku"),
  softlayerDeployer = require("./deployer/softlayer"),
  queueWorker = require("./queue-worker"),
  DeploymentManager = require("./deployer/deployment-manager"),
  nodeUuid = require("node-uuid"),
  url = require("url"),
  config = require("./config"),
  winston = require('winston'),
  _ = require("underscore");

module.exports = function(siteOptions) {
  var api = {},
    deploysConfig,
    responseData=[],
    failedNodes={},
    currentStats,
    site = siteOptions.site,
    dbDriver = siteOptions.db,
    worker = queueWorker(dbDriver,site,nodeUuid.v4()),
    router = siteOptions.router,
    deploymentManagers={};

  function getDeployNameOfNode(node) {
    var nodeDeployName;
    _.each(deploymentManagers,
      function(deploymentManager,deployName) {
      if(deploymentManager.getNode(node)) {
        nodeDeployName = deployName;
      }
    });
    return nodeDeployName;
  }

  api.addRequest = function(requestData) {
    if(requestData.failed) {
      failedNodes[requestData.node]++;
    }
    responseData.push(requestData);
  };

  api.processFailRequest = function() {
    _.each(failedNodes,function(failCount,node) {
      var deployName;
      if(failCount > 10) {
        deployName = getDeployNameOfNode(node);
        if(deployName) {
          worker.addWorkToQueue( {
              deployName:deployName,
              action:"redeploy",
              node:node
            }
          ); 
        }
      }
    });
    failedNodes = {};
  };

  function getInitStats(time) {
    return { time:Date.now(), site:site, nodes:{} };
  }
  function saveCurrentStats(currentStats) {
    winston.info("save stats",currentStats);
    if(!currentStats.nodes) {
      return;
    }
    _.each(currentStats.nodes, function(node) {
      ["time","site"].forEach(function(item) {
        node[item] = currentStats[item];
      });
      if(node.count > 0) {
        node.responseRate = node.responseRate / node.count;
      } else {
        node.responseRate = -1;
      }
      node.count += node.failed;
      dbDriver.logRequest(node);
    });
  }
  api.processRequest = function(callback) {
    var responsesWorking = _.clone(responseData),
      currentStats;
    winston.info("processRequest",responsesWorking);
    responseData = [];
    if(!currentStats) {
      currentStats = getInitStats(Date.now());
    }
    responsesWorking.forEach(function(response) {
      if((response.time + 10000) > currentStats.time) {
        saveCurrentStats(currentStats);
        currentStats = getInitStats(response.time);
      }
      if(!currentStats.nodes[response.node]) {
        currentStats.nodes[response.node] = {
          count:0,
          responseRate:0,
          failed:0,
          timeout:0,
          deployName:getDeployNameOfNode(node),
          node:response.node,
          target:response.target
        }
      }
      if(response.failed) {
        currentStats.nodes[response.node].failed++;
      } else {
        currentStats.nodes[response.node].count++;
        currentStats.nodes[response.node].responseRate += response.responseRate;
      }

    });
    saveCurrentStats(currentStats);
    callback();
  };

  function deployVersion(deployName,version,scaleLoss,done) {
    var deploymentManager = deploymentManagers[deployName],
      versionConfig = deploysConfig[deployName].versions[version],
      scale;
    if(versionConfig.minScale) {
      if(scaleLoss < versionConfig.minScale) {
        scale = versionConfig.minScale;
      } else {
        scale = scaleLoss;
      }
    } else {
      scale = scaleLoss;
    }
    async.waterfall(
      [
        function(next) {
          var params = _.clone(versionConfig);

          params.version = version;
          params.scale = scale;
          worker.addWorkToQueue({
            deployName:deployName,
            action:"deploy",
            version:version,
            options:{
              options:params
            }
          },
          next);
        }
      ],done
    );
  }

  function makeDeploymentManager(deployConfig,deployName,done) {
    //winston.info("makeDeploymentManager",deployConfig,deployName);
    var deploymentManager,
      deployer,
      options = {};

    async.waterfall(
      [
        function(next) {
          options.site = site;
          options.deployName = deployName;
          dbDriver.getRemoteCouchSync(deployName,site,next);
        },
        function(sync,next) {
          options.remoteSync = sync;
          next();
        },
        function(next) {
          var baseUrl;
          if( deployConfig.deployer ) {
            deployer = deployConfig.deployer;
            deploymentManagers[deployName] = DeploymentManager.multiApp(
              options,deployer);
          } else if(deployConfig.type === "cf" ) {
            deployer = cloudfoundry(deployConfig.deployConfig);
            deploymentManagers[deployName] = DeploymentManager.multiApp(
              options,deployer);
          } else if(deployConfig.type === "heroku" ) {
            deployer = herokuDeployer(deployConfig.deployConfig);
            deploymentManagers[deployName] = DeploymentManager.singleApp(
              options,deployer);
          } else if(deployConfig.type === "softlayer" ) {
            baseUrl = url.resolve(config.baseUrl,"docker");
            baseUrl = url.resolve(baseUrl+"/",site);
            baseUrl = url.resolve(baseUrl+"/",deployName);
            deployConfig.deployConfig.baseUrl = baseUrl+"/";
            deployer = softlayerDeployer(deployConfig.deployConfig);
            deploymentManagers[deployName] = DeploymentManager.multiApp(
              options,deployer);
          }
          deploymentManagers[deployName].syncNodes(next);
        }
      ],done
    );
  }

  function validateDeployment(deployName,done) {
    var deployConfig = deploysConfig[deployName],
      deploymentManager = deploymentManagers[deployName],
      configVersion = Object.keys(deployConfig.versions),
      deployedVersions = deploymentManager.getSiteVersions(),
      versionsToRemove,
      versionsToCheck,
      versionsToAdd,
      scaleRemove = 0;

    versionsToRemove = _.difference(deployedVersions,configVersion);
    versionsToAdd = _.difference(configVersion,deployedVersions);
    versionsToCheck = _.difference(deployedVersions,versionsToRemove);

    /*winston.info("Version",configVersion,deployedVersions,versionsToRemove,
      versionsToCheck, versionsToAdd);*/

    versionsToRemove.forEach(function(version) {
      scaleRemove += deploymentManager.getScale(version);
    });
    async.waterfall(
      [
        function(next) {
          async.each(versionsToAdd,
            function(version,callback) {
              var scaleLoss = 1;
              if( scaleRemove > 0 ) {
                scaleLoss = Math.ceil(scaleRemove/versionsToRemove.length);
              }
              deployVersion(deployName,version,
                scaleLoss,
                callback);
            },next
          );
        },
        function(next) {
          var activeVersion = deploymentManager.getActiveSiteVersions(),
            activeVersionsLeft;
          activeVersionsLeft = _.difference(activeVersion,versionsToRemove);
          if(activeVersionsLeft.length === 0 ) {
            winston.info("not removing version because no other active versions");
            return next();
          }
          async.each(versionsToRemove,
            function(version,callback) {
              winston.info("destorying version to remove",version);
              worker.addWorkToQueue( {
                  deployName:deployName,
                  action:"destroy",
                  version:version,
                  options: {
                    version:version
                  }
                },callback
              );
            },next
          );
        },
        function(next) {
          async.each(versionsToCheck,
            function(version,callback) {
                if(deployConfig.versions[version].minScale && (
                  deploymentManager.getScale(version) <
                  deployConfig.versions[version].minScale) ) {
                    var params = _.clone(deployConfig.versions[version]);
                    params.version = version;
                    worker.addWorkToQueue( {
                        deployName:deployName,
                        action:"scale",
                        version:version,
                        options: {
                          options:params,
                          scale:deployConfig.versions[version].minScale
                        }
                      },callback
                    );
                } else {
                    callback();
                }
              },next
            );
        }
      ],done
    );
  }

  function destroyDeployment(deployName,done) {
    var versions,
      deploymentManager = deploymentManagers[deployName];

    versions = deploymentManager.getSiteVersions();
    async.waterfall(
      [
        function(next) {
          async.each(versions, function(version,callback) {
              worker.addWorkToQueue(
                {
                  deployName:deployName,
                  action:"destroy",
                  version:version,
                  options: {
                    version:version
                  }
                },callback
              );
            },next
          );
        },
        function(next) {
          delete deploymentManagers[deployName];
          delete deploysConfig[deployName];
          next();
        }
      ],done
    );
  }

  api.updateDeployConfig = function(done) {
    //winston.info("update deploy config");
    if(!deploysConfig) {
      winston.info("no deploy config");
      return done();
    }
    async.waterfall(
      [
        function(next) {
          async.each(Object.keys(deploysConfig),
            function(deployName,callback) {

              if(!deploymentManagers[deployName]) {
                makeDeploymentManager(
                  deploysConfig[deployName],deployName,callback);
              } else {
                callback();
              }
            },
            next
          );
        },
        function(next) {
          async.each(Object.keys(deploysConfig),
            function(deployName,callback) {
              validateDeployment(deployName,callback);
            },
            next
          );
        },
        function(next) {
          async.each(Object.keys(deploymentManagers),
            function(deployName,callback) {
              if(!deploysConfig[deployName]) {
                destroyDeployment(deployName,callback);
              } else {
                callback();
              }
            },
            next
          );
        }
      ],done
    );
  };
  api.importDeployConfig = function(config,done) {
    deploysConfig = config;
    api.updateDeployConfig(done);
  };

  Object.defineProperties(api, {
    deploymentManagers: {
      value:deploymentManagers,
      writable:false
    }
  });

  api.loadConfig = function(done) {
//    winston.info("load config");
    async.waterfall(
      [
        function(next) {
          dbDriver.openDb(next);
        },
        function(next) {
          if(!dbDriver.db) {
            winston.info("did not open the db");
            return done();
          }
          dbDriver.db.view("site","by_host",
            {
              key: site
            },
            next
          );
        },
        function(body,info,next) {
          var siteConfig,
            features = {};
          
          if(body.rows.length > 0 ) {
            siteConfig = body.rows[0].value;
            if(siteConfig.router) {
              router.config[site] = siteConfig.router;
            }
            if(siteConfig.blacklist) {
              router.blacklist[site] = siteConfig.blacklist;
            }
            
            _.each(siteConfig.deployConfig, 
              function(deployConfig,deployName) {
              _.each(deployConfig.versions,
                function(versionConfig,version) {
                if(!versionConfig.features) {
                  features[deployName] = false;
                } else if( features[deployName] !== false ) {
                  if( features[deployName] === undefined ) {
                    features[deployName] = [];
                  }
                  features[deployName] = features[deployName].
                    concat(versionConfig.features);
                }
              });
            });
            _.each(features, function(value,key) {
              features[key] = _.uniq(value);
            });
            router.config[site].features = features;
            if(!router.featureConfig[site]) {
              router.featureConfig[site] = {};
            }
            if(siteConfig.features) {
              router.featureConfig[site].nodes = 
                Object.keys(siteConfig.features);
              router.featureConfig[site].balance = 
                siteConfig.features;
            }
            if(siteConfig.routes) {
              router.setUrlMatcher(site,siteConfig.routes);
            }
            deploysConfig = siteConfig.deployConfig;
          }
          next();
        }
      ], done
    );
  };

  api.getTarget = function(target,options) {
    winston.info("Get target",target);
    if(deploymentManagers[target]) {
      target = deploymentManagers[target].getTarget(options);
    }
    winston.info("got target",target);
    return target;
  };

  api.processQueue = function(done) {
    var workItem;
    async.waterfall(
      [
        function(next) {
          worker.startWorkItem(next);
        },
        function(workToStart,next) {
//           winston.info(workToStart);
          var deploymentManager;
          workItem = workToStart;
          if(workItem) {
            if(deploymentManagers[workToStart.deployName]) {
              deploymentManager = deploymentManagers[workToStart.deployName];
            } else {
              workItem = undefined;
              return worker.abortWork(workToStart._id,next);
            }
          }
          if(workItem) {

            if(workItem.action === "deploy" ) {
              deploymentManager.deploy( workItem.options.options,next);
            } else if(workItem.action === "destroy" ) {
              deploymentManager.destroy(workItem.options.version,next);
            } else if(workItem.action === "scale" ) {
              deploymentManager.scale(
                workItem.options.options,
                workItem.options.scale,
                next
              );
            } else if(workItem.action === "redeploy" ) {
              deploymentManager.redeployNode(workItem.options.node,next);
            } else {
              workItem = undefined;
              return worker.abortWork(workToStart._id,next);
            }
          } else {
            next();
          }
        },
        function(next) {
          if(workItem) {
            worker.finishWork(workItem._id,next);
          } else {
            next();
          }
        },
        function(next) {
          var didWork = false;
          if(workItem) {
            didWork = true;
          }
          next(null,didWork);
        }
      ],function(error,result) {
        if(error && workItem) {
          worker.abortWork(workItem._id,function() {
            done(error,result);
          });
        } else {
          done(error,result);
        }
      }
    );
  };

  function getCheckDeploymentName(deployName,versionScale,done) {
    async.waterfall(
      [
        function(next) {
          var currentTime = Date.now();
          winston.info("getting stats for",site,node,currentTime);
          dbDriver.db.view("logs","get_stats",
            {
              startkey: [ site, deployName, currentTime - 600000 ],
              endkey: [ site, deployName, currentTime ]
            },
            next
          );
        },
        function(body,info,next) {
          winston.info("got stats",body.rows);
          if(!body.rows[0]) {
            winston.info("no stats for node");
            return next();
          }
          var stat = body.rows[0].value,
            version = nodes[node].version;
          if( stat.count > 0 && ( (stat.timeout / stat.count) > .5 
              || (stat.responseRate / stat.count) > .8 ) ) {
            if( ! versionScale[version] ) {
              versionScale[version] = deploymentManagers[deployName].
                getScale(version)+1;
            }
          } else {
            next();
          }
        }
      ], done
    );
  }

  api.healthCheck = function(done) {
    async.each(Object.keys(deploymentManagers),
      function(deployName,callback) {
        var versionScale = {};
        async.waterfall(
          [
            function(next) {
              getCheckDeploymentName(deployName,versionScale,next);
            },
            function(next) {
              async.each(Object.keys(versionScale),
                function(version,moveOn) {
                  var params = _.clone(deployConfig.versions[version]);
                    params.version = version;
                    worker.addWorkToQueue( {
                      deployName:deployName,
                      action:"scale",
                      version:version,
                      options: {
                        options:params,
                        scale:versionScale[version]
                      }
                    },moveOn
                  );
                }, next
              );
            }
          ], callback
        );
      }, done
    );
  };

  function startBackgroundTask(task,timeout) {
    async.forever(function(done) {
      task(function() {
        setTimeout(done,timeout);
      });
    });
  }
  function processDeploymentManagementask(task,timeout) {
    startBackgroundTask(function(done) {
      async.each(Object.keys(deploymentManagers),
        function(deployName,callback) {
          deploymentManagers[deployName][task](callback);
        }, done
      );
    },timeout );
  }
  
  if(process.env.NODE_ENV !== "testing") {
    winston.info("starting background tasks");
    startBackgroundTask(api.healthCheck,600000);
    startBackgroundTask(api.processRequest,60000);
    startBackgroundTask(api.processFailRequest,20000);
    startBackgroundTask(api.loadConfig,5000);
    startBackgroundTask(api.updateDeployConfig,3000);
    startBackgroundTask(api.processQueue ,2000);
    processDeploymentManagementask("syncNodes",3000);
    processDeploymentManagementask("cleanupNodes",15000);
  }

  return api;
};
