var async = require("async"),
  cloudfoundry = require("../lib/deployer/cloudfoundry"),
  deploymentManager = require("../lib/deployer/deployment-manager"),
  expect = require("chai").expect,
  nodeUuid = require("node-uuid"),
  path = require("path");

describe("cloud foundry", function() {

  describe("cf system", function() {
    var cf,
      manager,
      code = path.resolve(__dirname,"test-app");
    before(function() {
      var options = {},
        remoteSync = {};
      remoteSync.setNodeState = function(name,status,options,done) {
        done();
      };
      remoteSync.deleteNode = function(name, done) {
        done();
      };
      remoteSync.registerManager = function(manager) {
        registerManager = true;
      };
      options.remoteSync = remoteSync;
      if(process.env.CF_USERNAME && process.env.CF_PASSWORD &&
        process.env.CF_TARGET && process.env.CF_DOMAIN &&
        process.env.CF_ORG ) {
        options.target = process.env.CF_TARGET;
        options.username = process.env.CF_USERNAME;
        options.password = process.env.CF_PASSWORD;
        options.domain = process.env.CF_DOMAIN;
        options.org = process.env.CF_ORG;
        options.buildpack =
          "https://github.com/heroku/heroku-buildpack-nodejs.git";
        cf = cloudfoundry(options);
        manager = deploymentManager.multiApp(options,cf);
      }
    });

    it("should be able to deploy an app",function(done) {
      this.timeout(600000);
      var appName = "test-app-"+nodeUuid.v4();
      if(cf) {
        async.waterfall(
          [
            function(next) {
              cf.deployInstance(appName,
                {code:code,manager:manager},
                next);
            }
          ],
          function(err) {
            console.log("delete instance");
            cf.deleteIntance(appName,{manager:manager},function() {
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
    var cf;
    beforeEach(function() {
      cf = cloudfoundry({domain:"test"});
    });
    it("should transform a name correctly",function() {
      expect(cf.transformTarget("testName")).to.be.equal(
        "https://testName.test");
    });
    it("should undefined for undefined",function() {
      expect(cf.transformTarget(undefined)).to.not.be.ok;
    });
  });

});
