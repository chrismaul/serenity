var async = require("async"),
  fs = require("fs.extra"),
  path = require("path"),
  nodeUuid = require("node-uuid"),
  yaml = require("js-yaml"),
  targetController = require("../target-controller"),
  fallbackTargetMiddleware = require("../fallback-target-middleware"),
  balancerTargetMiddleware = require("../balancer-target-middleware"),
  deployUtils = require("./utils"),
  spawn = require('child_process').spawn,
  _ = require("underscore");

module.exports = function(options, nodes) {

  var api = {},
    nodes = {},
    controllerData = {},
    blacklist = [],
    controllerConfig = {},
    controller = targetController();
  controller.add(balancerTargetMiddleware);
  controller.add(fallbackTargetMiddleware);
  nodes.active = {};
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
  api.createManifest = function (code,name,done) {
    var app = {},
      yamlOutput,
      yamlText;
    app.name = name;
    app.memory = options.memory || "256M";
    app.instances = 1;
    app.host = name;
    app.domain = options.domain;
    if(options.env) {
      app.env = options.env;
    }
    if(options.buildpack) {
      app.buildpack = options.buildpack;
    }
    yamlOutput = {applications:[app]};

    yamlText = yaml.safeDump(yamlOutput);

    fs.writeFile(path.resolve(code,"manifest.yml"),yamlText,done);
  };

  api.deployInstance = function(code,name,opts,done) {
    async.waterfall(
      [
        function(next) {
          api.createManifest(code,name,next);
        },
        function(next) {
          api.setNodeState(name,"deploying",opts);
          runCFCommand(["push"],{cwd:code},next);
        },
        function(next) {
          var url = "https://"+name+"."+options.domain;
          api.setNodeState(name,"deployed",{url:url});
          next(null,url);
        }
      ],
    done);
  };

  api.deleteIntance = function(name,done) {
    runCFCommand(["delete",name,"--routes"],
      function(error) {
        if(error) {
          api.setNodeState(name,"errorDelete",{});
        } else {
          api.deleteNode(name);
        }
        done(error);
      }
    );
  };



  function runCFCommand(args,done) {
    var env = _.clone(process.env),
      tmpHome = path.resolve(process.env.TEMP_DIR || "/tmp" , nodeUuid.v4()),
      opts = {};
    if(arguments.length === 3 ) {
      opts = arguments[1];
      done = arguments[2];
    }
    env.HOME=tmpHome;
    opts.env = env;
    async.waterfall(
      [
        function(next) {
          fs.mkdir(tmpHome,0755,next);
        },
        function(next) {
          deployUtils.runCommand("cf",["target",options.target], opts , next );
        },
        function(next) {
          var args = [
            "login",
            "--username",options.username,
            "--password", options.password
          ];
          if(options.org) {
            args.push("--org");
            args.push(options.org);
          }
          if(options.space) {
            args.push("--space");
            args.push(options.space);
          }
          deployUtils.runCommand("cf", args, opts , next);
        },
        function(next) {
          args.unshift("--script");
          deployUtils.runCommand("cf", args, opts , next);
        }
      ],
      function(err) {
        fs.rmrf(tmpHome,
          function() {
            done(err);
          }
        );
      }
    );
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
        api.deployInstance(params.code,name,opts,
          function(error,url) {
            deployed = true;
            if(error) {
              deployed = false;
              return api.deleteIntance(name,next);
            } else if(params.test) {
              params.test(name, params, opts ,function(fail) {
                if(fail) {
                  deployed = false;
                  return api.deleteIntance(name,next);
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

  /*
   * params
   *  scale
   *  name
   *  test
   *  code
   * opts
   *  version
   */
  api.deploy = function( params, opts, done ) {
    api.scaleUp(params,params.scale,opts,done);
  };

  api.scaleUp = function( params, scale, opts, done ) {
    var count = getSiteCount(params.name,opts.version),
      basename = params.name;

    opts.siteName = basename;
    async.whilst(
      function() {
        return count < scale;
      },
      function(callback) {
        var name = basename+"-"+nodeUuid.v4();
        count++;
        api.testAndDeploy( name, params, opts, callback );
      },
      done
    );
  };

  api.scaleDown = function( params, scale, opts, done ) {
    var count = getSiteCount(params.name,opts.version);
    async.whilst(
      function() {
        return count > scale;
      },
      function(callback) {
        var siteNodes = getSiteNodes(params.name,opts.version),
          node;
        count--;
        if(siteNodes.length > 0 ) {
          node = _.sample(siteNodes);
          api.deleteIntance(node.name,callback);
        } else {
          callback();
        }
      },
      done
    );
  };

  api.destroy = function( params, opts, done ) {
    api.scaleDown(params,0,opts,done);
  };

  api.getTarget = function() {
    var target = controller.getTarget(controllerConfig,controllerData,blacklist);
    if(target) {
      target += "." + options.domain;
    }
    return target;

  };

  return api;
};