var async = require("async"),
  deployUtils = require("./utils"),
  request = require("request"),
  fs = require("fs.extra"),
  path = require("path"),
  url = require("url");

module.exports = function(options) {

  var api = {},
    herokuBuffer = new Buffer("+:"+options.herokuKey),
    herokuKey;

  if(!options.env) {
    options.env = {deployer:"serenity" };
  }
  herokuKey = herokuBuffer.toString("base64");

  function herokuRequest(endpoint,options,done) {
    options.headers = {};
    options.headers.Accept = "application/vnd.heroku+json; version=3";
    options.headers.Authorization = herokuKey;
    options.url = url.resolve("https://api.heroku.com/apps",endpoint);
    request(options,done);
  }

  api.scale = function(params,scale,done) {
    // not implementing yet
    done();
  };

  api.deployInstance = function(name, params, done) {
    var gitUrl,
      code = params.code,
      siteUrl;
    async.waterfall(
      [
        function(next) {
          params.manager.setNodeState(name,"deploying",params,next);
        },
        function(next) {
          herokuRequest("apps",{
            json: {
              name:name,
              region:"us",
              stack:"cedar"
            },
            method: "POST"
          },next);
        },

        function(response, data, next) {
          if(response.statusCode === 201 ) {
            gitUrl = data["git_url"];
            siteUrl = data["web_url"];
            next();
          } else {
            next(new Error("Error creating app " + JSON.stringify(data)));
          }
        },
        function(next) {
          herokuRequest("apps/"+name+"/config-vars",{
            json: options.env,
            method:"PATCH"
          },next);
        },
        function(response, data, next) {
          if(response.statusCode === 200) {
            next();
          } else {
            next(new Error("Error updating the enviroment " +
            JSON.stringify(data)));
          }
        },
        function(next) {
          fs.exists(path.resolve(code,".git"),function(exists) {
            next(null,exists)
          });
        },
        function(exists,next) {
          if(exists) {
            fs.rmrf(path.resolve(code,".git"),next);
          } else {
            next();
          }
        },
        function(next) {
          deployUtils.runCommand("git",["init"],{cwd:code},next);
        },
        function(next) {
          deployUtils.runCommand("git",["add","."],{cwd:code},next);
        },
        function(next) {
          deployUtils.runCommand("git",["commit","-a","-m","heroku"],{cwd:code},next);
        },
        function(next) {
          deployUtils.runCommand("git",["remote","add","heroku",gitUrl],
            {cwd:code},next);
        },
        function(next) {
          deployUtils.runCommand("git",["push", "-f", "heroku","master"],
            {cwd:code},next);
        },
        function(next) {
          params.manager.setNodeState(name,"deployed",{url:siteUrl},next);
        },
        function(next) {
          next(null,siteUrl);
        }
      ],
    done);
  };

  api.deleteIntance = function(name,params,done) {
    async.waterfall(
      [
        function(next) {
          herokuRequest("apps/"+name,{method:"DELETE"},function(error) {
            next(null,error);
          });
        },
        function(error,next) {
          if(error) {
            params.manager.setNodeState(name,"errorDelete",{},next);
          } else {
            params.manager.deleteNode(name,next);
          }
        }
      ],
    done);
  };

  api.transformTarget = function(target) {
    if(target) {
      target = "https://"+ target + ".herokuapp.com";
    }
    return target;
  };

  return api;
};