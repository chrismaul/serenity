var async = require("async"),
  herokuDeployer = require("../lib/deployer/heroku"),
  deploymentManager = require("../lib/deployer/deployment-manager"),
  expect = require("chai").expect,
  nodeUuid = require("node-uuid"),
  path = require("path");

describe("heroku", function() {

  describe("system", function() {
    var heroku,
      manager,
      code = path.resolve(__dirname,"test-app");
    before(function() {
      var options = {};
      if(process.env.HEROKU_API_KEY) {
        options.herokuKey = process.env.HEROKU_API_KEY;
        heroku = herokuDeployer(options);
        manager = deploymentManager.singleApp(options,manager);
      }
    });

    it("should be able to deploy an app",function(done) {
      this.timeout(600000);
      var appName = "test-app-"+nodeUuid.v4().substr(0,5);
      if(heroku) {
        async.waterfall(
          [
            function(next) {
              heroku.deployInstance(appName,
                {code:code,manager:manager},
                {},
                next);
            }
          ],
          function(err) {
            heroku.deleteIntance(appName,{manager:manager},function() {
              done(err);
            });
          }
        );
      } else {
        done();
      }
    });
  });
  describe("transform target", function() {
    var heroku;
    beforeEach(function() {
      heroku = herokuDeployer({herokuKey:"test"});
    });
    it("should transform a name correctly",function() {
      expect(heroku.transformTarget("testName")).to.be.equal(
        "https://testName.herokuapp.com");
    });
    it("should undefined for undefined",function() {
      expect(heroku.transformTarget(undefined)).to.not.be.ok;
    });
  });

});