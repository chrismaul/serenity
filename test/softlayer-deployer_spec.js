var async = require("async"),
  softlayerDeployer = require("../lib/deployer/softlayer"),
  deploymentManager = require("../lib/deployer/deployment-manager"),
  expect = require("chai").expect,
  nodeUuid = require("node-uuid"),
  path = require("path");

describe("softlayer", function() {

  describe("transform target", function() {
    var softlayer;
    beforeEach(function() {
      softlayer = softlayerDeployer({domain:"testDomain.com"});
    });
    it("should transform a name correctly",function() {
      expect(softlayer.transformTarget("testName")).to.be.equal(
        "http://testName.testDomain.com");
    });
    it("should undefined for undefined",function() {
      expect(softlayer.transformTarget(undefined)).to.not.be.ok;
    });
  });

});