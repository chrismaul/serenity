var buildUtils = require("./build"),
  async = require("async"),
  path = require("path"),
  fs = require("fs"),
  queueWorker = require("../lib/queue-worker"),
  _ = require("underscore");
module.exports = function(dbDriver) {
  var api = {},
    worker = queueWorker(dbDriver,"deployCode",nodeUuid.v4());

  function getSite(siteName,done) {
    async.waterfall(
      [
        function(next) {
          dbDriver.db.view("site","by_host", {
            key: siteName
          }, next );
        },
        function(body,headers,next) {
          if(body.rows.length === 1 ) {
            next(null,body.rows[0].value);
          } else {
            next(new Error("could not find the site"));
          }
        }
      ],done
    );
  }

  api.deployNewVersion = function(options,site,done) {
    var src = path.resolve(process.env.TEMP_DIR || "/tmp" , site),
      commitId;
    async.waterfall(
      [
        function(next) {
          fs.exists(src,function(exists) {
            next(null,exists);
          });
        },
        function(exists,next) {
          if(!exists) {
            build.cloneRepo(options.repo,src,next);
          } else {
            build.pullRepo(src,next);
          }
        },
        function(next) {
          build.getLastGitCommit(src, next);
        },
        function(commit,next) {
          commitId = commit;
          getSite(site, next);
        },
        function(site,next) {
          var deployBuild = false;
          _.each(site.deployConfig,function(deployConfig,deployName) {
            if(!deployConfig.versions[commitId]) {
              deployBuild = true;
            }
          });
          if(deployConfig) {
            options.site = site;
            options.src = src;
            if(options.basedir) {
              options.src = path.resolve(src,options.basedir);
            }
            api.deploySite(commitId,options,next);
          }
        }
      ], done
    );
  };

  api.deploySite = function(name,options,done) {
    var codeLocation,
      dockerLocation,
      dockerImageName,
      src = options.src;
    async.waterfall(
      [
        function(next) {
          buildUtils.buildCode(name+"Code",src,next);
        },
        function(location,next) {
          codeLocation = location;
          dockerImageName = name+"Docker";
          buildUtils.buildDocker(dockerImageName,src,next);
        },
        function(location,next) {
          dockerLocation = location;
          getSite(options.site,next);
        },
        function(site,next) {
          var versionConfig = options.options || {};
          _.each(site.deployConfig,function(deployConfig,deployName) {
            if(deployConfig.type === "heroku" || deployConfig.type === "cf") {
              versionConfig.url = codeLocation;

            } else if(deployConfig.type === "softlayer" ) {
              versionConfig.url = dockerLocation;
              versionConfig.image = dockerImageName;
            }
            versionConfig.deployCode = versionConfig.url.split("/").pop();
            if(options.nextScale) {
              versionConfig.nextScale = options.nextScale+Date.now();
            }
            if(options.startScale) {
              versionConfig.balance = options.startScale;
            }
            versionConfig.deployTime = Date.now();
            deployConfig.versions[name] = versionConfig;
          });
          dbDriver.db.insert(site,next);
        },
        function(body,info,next) {
          next();
        }
      ],done
    );
  };
  api.scaleVersion = function(name,siteName, options, done) {
    var removeBuilds = [];
    async.waterfall(
      [
        function(next) {
          getSite(siteName,next);
        },
        function(site,next) {
          _.each(site.deployConfig,function(deployConfig,deployName) {
            _.each(deployConfig.versions,function(version,versionName) {
              if(versionName === name) {
                version.balance = options.balance;
                version.nextScale = options.nextScale;
              } else if(options.balance === 10 && version.balance === 10) {
                if(version.deployCode) {
                  removeBuilds.push(version.deployCode);
                }
                delete deployConfig.versions[versionName];
              }
            });
          });
          dbDriver.db.insert(site,next);
        },
        function(body,info,next) {
          async.each(_.uniq(removeBuilds),function(build,callback) {
            buildUtils.removeCode(build,callback);
          },next);
        }
      ],done
    );
  };

  api.getSitesToBuild = function(done) {
    async.waterfall(
      [
        function(next) {
          dbDriver.db.view("build","by_site", next );
        },
        function(body,headers,next) {
          next(null,_.pluck(body.rows,"value"));
        }
      ],done
    );
  };

  function checkBuild(build,done) {
    var site;
    async.waterfall(
      [
        function(next) {
          getSite(build.site,next);
        },
        function(result,next) {
          site = result;
          next();
        },
        function(next) {
          var newBuild = false,
            lastBuild;
          if(build.buildInterval) {
            _.each(site.deployConfig,function(deployConfig,deployName) {
              _.each(deployConfig.versions,function(version,versionName) {
                if(version.deployTime) {
                  if(!lastBuild) {
                    lastBuild = version.deployTime;
                  } else {
                    lastBuild = Math.max(version.deployTime,lastBuild)'
                  }
                }
              });
            });
            if(lastBuild) {
              if(lastBuild + build.buildInterval < Date.now()) {
                newBuild = true;
              }
            } else {
              newBuild = true;
            }
          }
          if(newBuild) {
            worker.addWorkToQueue({
              deployName:build.site,
              action:"build",
              version:"new",
              options:{
                repo:build.repo,
                basedir:build.basedir,
                nextScale:build.nextScale,
                startScale:build.startScale,
                options:build.deployOptions
              }
            });
          }
          next();
        },

        function(next) {
          _.each(site.deployConfig,function(deployConfig,deployName) {
            _.each(deployConfig.versions,function(versionConfig,version) {
              var stageDeploy = build.stageDeploy[versionConfig.balance];
              if(versionConfig.nextScale < Date.now() &&
                stageDeploy) {
                worker.addWorkToQueue({
                  deployName:build.site,
                  action:"scale",
                  version:version,
                  options:{
                    balance:stageDeploy.nextLevel,
                    nextScale:stageDeploy.nextScale+Date.now()
                  }
                });
              }
            });
          });
        }
      ],done
    );
  }

  api.checkBuilds = function(done) {
    async.waterfall(
      [
        function(next) {
          api.getSitesToBuild(next);
        },
        function(builds,next) {
          async.each(build,checkBuild,next);
        }
      ],done
    );
  };

  api.processQueue = function(done) {
    var workItem;
    async.waterfall(
      [
        function(next) {
          worker.startWorkItem(next);
        },
        function(workToStart,next) {
          winston.info(workToStart);
          if(workItem) {
            if(workItem.action === "scale" ) {
              (name,level,siteName, done)
              api.scaleVersion(workItem.version,workItem.deployName,
                workItem.options,next);
            } else if(workItem.action === "build" ) {
              api.deployNewVersion(workItem.options, workItem.deployName, next);
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

  function startBackgroundTask(task,timeout) {
    async.forever(function(done) {
      task(function() {
        setTimeout(done,timeout);
      });
    });
  }

  if(process.env.NODE_ENV !== "testing") {
    //winston.info("starting background tasks");
    startBackgroundTask(api.healthCheck,60000);
    startBackgroundTask(api.checkBuilds,60000);
  }

  return api;
};