var async = require("async"),
  dbUtils = require("./db-utils"),
  expect = require("chai").expect;

describe("couchdb driver", function() {
  var driver,
    dbName;
  beforeEach(function(done) {
    async.waterfall(
      [
        dbUtils.makeDBDriver,
        function(name,dbDriver,next) {
          driver = dbDriver;
          dbName = name;
          next();
        }
      ],done
    );
  });
  afterEach(function(done) {
    dbUtils.destroyDb(dbName,done);
  });

  it("should be able to create views",function(done) {
    async.waterfall(
      [
        function(next) {
          driver.db.insert({type:"test","testing":true},next);
        },
        function(body,info,next) {
          driver.db.view("test","test_view",next);
        },
        function(body,info,next) {
          expect(body.rows.length).to.be.equal(1);
          expect(body.rows[0].value.testing).to.be.true;
          next();
        }
      ],done
    );
  });
});