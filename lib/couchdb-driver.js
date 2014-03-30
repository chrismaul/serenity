var async = require("async"),
  path = require("path"),
  nano = require("nano"),
  couchdbRemoteSync = require("./couchdb-remote-sync"),
  fs = require("fs"),
  _ = require("underscore");

module.exports = function(options) {
  var viewDirectory = path.resolve(__dirname,"views"),
    api = {};
  function fillinDBView(directory,view, done) {
    async.waterfall(
      [
        function(next) {
          fs.readdir(path.resolve(viewDirectory,directory),next);
        },
        function(files,next) {
          files.forEach(function(item) {
            var viewName = path.basename(item,".js");
            view[viewName] = require(
              path.resolve(viewDirectory,directory,viewName)
            );

          });
          next(null);
        }
      ],done
    );
  }

  function makeDBViews(done) {
    var views = {};
    async.waterfall(
      [
        function(next) {
          fs.readdir(viewDirectory,next);
        },
        function(files,next) {
          async.each(files,
            function(item,callback) {
              views[item]={};
              fillinDBView(item,views[item],callback);
            } ,next
          );
        },
        function(next) {
          async.eachSeries(Object.keys(views),
            function(viewName,callback) {
              var viewData = {views:views[viewName]};
              api.db.insert(viewData, "_design/"+viewName, callback);
            },
            next
          );
        }
      ], function(error) {
        //just ignoring error until I can handle it properly
        done();
      }
    );
  }

  api.openDb = function(done) {
    if(!api.db) {
      api.driver = nano(options.couchDBServer);
      api.db = api.driver.use(options.couchDBName);
      makeDBViews(done);
    } else {
      done();
    }

  };

  api.getRemoteCouchSync = function(deployName,site,done) {
    async.waterfall(
      [
        api.openDb,
        function(next) {
          next(null,couchdbRemoteSync(api.db,deployName,site));
        }
      ], done
    );
  }
  api.logRequest = function(request,done) {
    request.type = "logEntry";
    async.waterfall(
        [
            api.openDb,
            function(next) {
                api.db.insert(request,next);
            }
        ],
    done);
  };
  return api;

};