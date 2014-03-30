var fallbackTargetMiddleware = require("../lib/fallback-target-middleware"),
  expect = require("chai").expect;

describe("fallback target middleware", function() {
  var options;

  beforeEach(function() {
    options = {
      config: {
        nodes: [ "node1", "node2" ]
      },
      blacklist: []
    };
  });

  it("should not pick a new target if one exists", function() {
    var target = "testTarget",
      newTarget;
    newTarget = fallbackTargetMiddleware(target,options);
    expect(newTarget).to.be.equal(target);
  });

  it("should not pick a new target if they are no nodes", function() {
    var target;
    options.config.nodes = false;
    target = fallbackTargetMiddleware(false,options);
    expect(target).to.not.be.ok;
  });

  it("should pick a new target if one does not exists", function() {
    var target = fallbackTargetMiddleware(false,options);
    expect(options.config.nodes).to.contain(target);
  });


  it("should not pick a node in the blacklist", function() {
    var target;
    options.config.nodes = [ "node1", "node2" ];
    options.blacklist = [ "node1" ];
    target = fallbackTargetMiddleware(false,options);
    expect(target).to.be.equal("node2");
  });

  it("should pick a node in the blacklist, if they are no other options",
    function() {
    var target;
    options.config.nodes = [ "node1" ];
    options.blacklist = [ "node1" ];
    target = fallbackTargetMiddleware(false,options);
    expect(target).to.be.equal("node1");
  });

});