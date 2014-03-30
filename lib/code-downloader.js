var async = require("async"),
  fs = require("fs.extra"),
  path = require("path"),
  request = require("request"),
  winston = require('winston'),
  utils = require("./deployer/utils");

module.exports = function() {
  var api = {};
  api.downloadCode = function(node, site, deployName, done) {
    var tmpFile;
    if(node.url) {
      tmpFile = path.resolve(__dirname,"tmp",site,
        deployName,node.version);
      async.waterfall(
        [
          function(next) {
            fs.mkdirs(tmpFile,next);
          },
          function(result,next) {
            winston.info("downloading code ",node.url);
            var req = request(node.url).pipe(
              fs.createWriteStream(path.resolve(tmpFile,"download.tar.gz.gpg"))
            );
            req.on("close",function() {
              winston.info("done downloading code ",node.url);
              next();
            });
          },
          function(next) {
            winston.info("decrypting ",node.url);
            utils.runCommand("gpg",["-d",
              "--output", path.resolve(tmpFile,"download.tar.gz"),
              path.resolve(tmpFile,"download.tar.gz.gpg")
              ], {}, next);
          },
          function(next) {
            winston.info("extracting ",node.url);
            utils.runCommand("tar",["xf",
              path.resolve(tmpFile,"download.tar.gz"),
              "-C", tmpFile], {}, next);
          },
          function(next) {
            fs.unlink(path.resolve(tmpFile,"download.tar.gz.gpg"),next);
          },
          function(next) {
            fs.unlink(path.resolve(tmpFile,"download.tar.gz"),next);
          },
          function(next) {
            winston.info("done downloading code ",tmpFile);
            next(null,tmpFile);
          }
        ], done
      );
    } else {
      done(null,node.code);
    }
  };
  return api;
};
