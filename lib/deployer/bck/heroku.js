var async = require("async"),
  fs = require("fs.extra"),
  path = require("path"),
  nodeUuid = require("node-uuid"),
  yaml = require("js-yaml"),
  spawn = require('child_process').spawn,
  _ = require("underscore");

module.exports = function(deployName,options) {

  var api = {},
    manager = options.manager;

  function runCommand(cmd,args,opts, done) {
    var proc = spawn(cmd,args, opts );
    proc.stdout.on("data", function (data) {
      console.log(data);
    });

    proc.stderr.on("data", function (data) {
      console.log(data);
    });
    proc.on("close", function(returnCode) {
      var error;
      if(returnCode !== 0 ) {
        error = new Error("error command failed exit code"+returnCode);
      }
      done(error);
    });
  }

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
          runCommand("cf",["target",options.target], opts , next );
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
          runCommand("cf", args, opts , next);
        },
        function(next) {
          args.unshift("--script");
          runCommand("cf", args, opts , next);
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
  
  return api;
};