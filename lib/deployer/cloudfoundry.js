var async = require("async"),
  fs = require("fs.extra"),
  path = require("path"),
  yaml = require("js-yaml"),
  nodeUuid = require("node-uuid"),
  deployUtils = require("./utils"),
  spawn = require('child_process').spawn,
  _ = require("underscore");

module.exports = function(options) {

  var api = {};

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

  api.deployInstance = function(name,params,done) {
    var url;

    async.waterfall(
      [
        function(next) {
          api.createManifest(params.code,name,next);
        },
        function(next) {
          params.manager.setNodeState(name,"deploying",params,next);
        },
        function(next) {
          runCFCommand(["push"],{cwd:params.code},next);
        },
        function(next) {
          url = "https://"+name+"."+options.domain;
          params.manager.setNodeState(name,"deployed",{url:url},next);
        },
        function(next) {
          next(null,url);
        }
      ],
    done);
  };

  api.deleteIntance = function(name,params,done) {
    async.waterfall(
      [
        getInstances,
        function(instances, next) {
          if(_.contains(instances,name)) {
            runCFCommand(["delete","--routes",name],function(error) {
              next(null,error);
            });
          } else {
            next();
          }
        },
        function(error,next) {
          if(error) {
            params.manager.setNodeState(name,"errorDelete",{},next);
          } else {
            params.manager.deleteNode(name,next);
          }
        }
      ], done
    );
  };

  function getInstances(done) {
    runRawCFCommand(
      function(opts,next) {
        var output="",
          proc;
        proc = spawn( "cf", ["--script","apps" ], opts );
        proc.stdout.on("data",function(data) {
          output += data;
        });
        proc.on("close", function(returnCode) {
          var error;
          if(returnCode !== 0 ) {
            error = new Error("error command failed exit code "+returnCode);
          }
          next(error, output.split("\n"));
        });
      }, done
    );
  }

  function runRawCFCommand(callback,done) {
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
            "--script",
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
          callback(opts,next);
        }
      ],
      function() {
        var args = Array.prototype.slice.call(arguments);
        fs.rmrf(tmpHome,
          function() {
            done.apply({},args);
          }
        );
      }
    );
  }

  function runCFCommand(args,done) {
    var opts = {};
    if(arguments.length === 3 ) {
      opts = arguments[1];
      done = arguments[2];
    }
    runRawCFCommand(
      function(opts,next) {
        args.unshift("--script");
        deployUtils.runCommand("cf", args, opts , next);
      },opts,done
    );
  }

  api.transformTarget = function(target) {
    if(target) {
      target = "https://"+ target + "." + options.domain;
    }
    return target;
  };

  return api;
};
