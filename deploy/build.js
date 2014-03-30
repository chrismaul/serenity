var utils = require("../lib/deployer/utils"),
  path = require("path"),
  winston = require("winston"),
  fs = require("fs.extra"),
  spawn = require('child_process').spawn;

var api = {};

api.getLastGitCommit = function(src,done) {
  var commitId;
  async.waterfall(
    [
      function(next) {
        var proc = spawn( "git", ["log","--format=%H", "HEAD^..HEAD",
          { cwd:src } );
        proc.stdout.on("data", function (data) {
          commitId = data;
          });
        proc.stderr.on("data", function (data) {
          winston.info(""+data);
        });
        proc.on("close", function(returnCode) {
          var error;
          if(returnCode !== 0 ) {
            error = new Error("error command failed exit code "+returnCode);
          }
          next(error,commitId);
        });
      }
    ], done
  );
};

api.cloneRepo = function(src,dest,done) {
  async.waterfall(
    [
      function(next) {
        utils.runCommand( "git", ["clone", src, dest], {}, next);
      }
    ], done
  );
};

api.pullRepo = function(src,done) {
  async.waterfall(
    [
      function(next) {
        utils.runCommand( "git", ["pull"], { cwd: src}, next);
      }
    ], done
  );
};

function cleanupTmpDocker(name,tmpDir,done) {
  async.waterfall(
    [
      function(next) {
        fs.rmrf(tmpDir,next);
      },
      function(next) {
        api.rmDockerImage(name,next);
      }
    ],done
  );
}

api.buildCode = function(name,src,done) {
  var tmpDir = path.resolve(process.env.TEMP_DIR || "/tmp" , nodeUuid.v4());
  async.waterfall(
    [
      function(next) {
        fs.mkdir(tmpDir,0755,next);
      },
      function(next) {
        api.pacakgeCode(name,src,tmpDir,next);
      },
      function(location,next) {
        api.uploadCode(location,tmpDir,next);
      }
    ], function() {
      var args = Array.prototype.slice.call(arguments);
      fs.rmrf(tmpDir,
        function() {
          done.apply({},args);
        }
      );
    }
  );
};

api.buildDocker = function(name,src,done) {
  var tmpDir = path.resolve(process.env.TEMP_DIR || "/tmp" , nodeUuid.v4());
  async.waterfall(
    [
      function(next) {
        fs.mkdir(tmpDir,0755,next);
      },
      function(next) {
        api.buildDockerImage(src,name,next);
      },
      function(next) {
        api.saveDockerImage(name,tmpDir,next);
      },
      function(next) {
        api.pacakgeCode(name,tmpDir,tmpDir,next);
      },
      function(location,next) {
        api.uploadCode(location,tmpDir,next);
      }
    ], function() {
      var args = Array.prototype.slice.call(arguments);
      cleanupTmpDocker(name,tmpDir,
        function() {
          done.apply({},args);
        }
      );
    }
  );
};

api.buildDockerImage = function(src,name,done) {
  async.waterfall(
    [
      function(next) {
        utils.runCommand("docker", ["build", "-rm=true","-t="+name,"."],{
          cwd:src
        }, next);
      }
    ], done
  );
};

api.rmDockerImage = function(name,done) {
  async.waterfall(
    [
      function(next) {
        utils.runCommand("docker", ["rmi",name],{
          cwd:src
        }, next);
      }
    ], done
  );
};

api.saveDockerImage = function(name,output,done) {
  async.waterfall(
    [
      function(next) {
        var proc = spawn( "docker", ["save","name"] );
        proc.stdout.pipe(
          fs.createWriteStream(path.resolve(output,"docker.tar"))
        );
        proc.stderr.on("data", function (data) {
          winston.info("> "+data);
        });
        proc.on("close", function(returnCode) {
          var error;
          if(returnCode !== 0 ) {
            error = new Error("error command failed exit code "+returnCode);
          }
          next(error);
        });
      }
    ], done
  );
};

api.pacakgeCode = function(name,src,output,done) {
  async.waterfall(
    [
      function(next) {
        utils.runCommand("tar", ["czf", path.resolve(output,name+".tar.gz"), "."],{
          cwd:src
        }, next);
      },
      function(next) {
        utils.runCommand("gpg", ["-e", "-r","maulc","--trust-model",
          "always", output],{}, next);
      },
      function(next) {
        next(null,name+".tar.gz.gpg");
      }
    ], done
  );
};

api.removeCode = function(src,done) {
  async.waterfall(
    [
      function(next) {
        utils.runCommand("swift", ["-A", config.swift.auth, "-U",
          config.swift.user,"-K",config.swift.key,"delete",
          config.swift.container,src ], next);
      }
    ], done
  );
};

api.uploadCode = function(src,dir,done) {
  async.waterfall(
    [
      function(next) {
        utils.runCommand("swift", ["-A", config.swift.auth, "-U",
          config.swift.user,"-K",config.swift.key,"upload",
          config.swift.container,src ],{
            cwd:dir
          }, next);
      },
      function(next) {
        var location = url.resovle(config.swift.base,config.swift.container);
        location = url.resovle(location,+"/"+src);
        next(null,location);
      }
    ], done
  );
};
module.exports = api;