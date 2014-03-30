var siteRouter = require("../lib/site-router"),
  expect = require("chai").expect,
  _ = require("underscore");

describe("site router", function() {
  var router;

  beforeEach(function() {
    router = siteRouter();
  });


  it("should use good site defaults", function() {
    var hasFound = false,
      target;
    router.controller.add(function(target,options) {
      expect(options.config).to.deep.equal({});
      expect(options.data).to.deep.equal({});
      expect(options.blacklist).to.deep.equal([]);
      hasFound = true;
      return "test target"
    });
    target = router.getTarget("testing");
    expect(target.target).to.be.equal("test target");
    expect(hasFound).to.be.true;
  });

  it("should use good site data", function() {
    var hasFound = false,
      target,
      config = { config:true },
      data = { data:true },
      blacklist = [ "black" ];
    router.config.testing = config;
    router.data.testing = data;
    router.blacklist.testing = blacklist;
    router.controller.add(function(target,options) {
      expect(options.config).to.deep.equal(config);
      expect(options.data).to.deep.equal(data);
      expect(options.blacklist).to.deep.equal(blacklist);
      hasFound = true;
      return "test target"
    });
    target = router.getTarget("testing");
    expect(target.target).to.be.equal("test target");
    expect(hasFound).to.be.true;
  });
});