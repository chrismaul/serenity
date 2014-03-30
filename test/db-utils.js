var async = require("async"),
  config = require("../lib/config"),
  nano = require("nano"),
  couchdbDriver = require("../lib/couchdb-driver"),
  nodeUuid = require("node-uuid");

var api = {};
api.makeDBDriver = function(done) {
  var db,
    dbName = "test-"+nodeUuid.v4(),
    dbDriver;
  async.waterfall(
    [
      function(next) {
        db = nano(config.couchDBServer);
        db.db.create(dbName,next);
      },
      function(body,info,next) {
        dbDriver = couchdbDriver({
          couchDBServer:config.couchDBServer,
          couchDBName:dbName
        });
        dbDriver.openDb(function(error) {
          next(error,dbName,dbDriver);
        });
      }
    ],done
  );
};
api.destroyDb = function(dbName,done) {
  db = nano(config.couchDBServer);
  db.db.destroy(dbName,done);
};
module.exports = api;