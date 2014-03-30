var spawn = require('child_process').spawn,
  winston = require('winston');

var api = {};
api.runCommand = function(cmd,args,opts, done) {
  var proc = spawn( cmd, args, opts );
  winston.info(cmd,args);
  proc.stdout.on("data", function (data) {
    winston.info("> "+data);
  });

  proc.stderr.on("data", function (data) {
    winston.info("> "+data);
  });
  proc.on("close", function(returnCode) {
    var error;
    if(returnCode !== 0 ) {
      error = new Error("error command failed exit code "+returnCode);
    }
    done(error);
  });
};
module.exports = api;
