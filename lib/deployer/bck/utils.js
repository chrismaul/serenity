var api = {};

api.runCommand = function(cmd,args,opts, done) {
  var proc = spawn( cmd, args, opts );
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
};
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
        params.deployer.deployInstance(params.code,name,opts,
          function(error,url) {
            deployed = true;
            if(error) {
              deployed = false;
              return api.deleteIntance(name,next);
            } else if(params.test) {
              params.deployer.test(name, params, opts ,function(fail) {
                if(fail) {
                  deployed = false;
                  return params.deployer.deleteIntance(name,next);
                } else {
                  params.manager.setNodeState(name,"active",{});
                  return next();
                }
              });
            } else {
              params.manager.setNodeState(name,"active",{});
              next();
            }
          }
        );
      },
      done
    );
  }
module.exports = api;