var targetController = require("../lib/target-controller"),
  expect = require("chai").expect;

describe("target controller", function() {
  var controller;
  beforeEach(function() {
    controller = targetController();
  });

  it("return nothing if there is no controllers", function() {
    var controllerTarget = controller.getTarget();
    expect(controllerTarget).to.not.be.ok;
  });

  it("runs middleware", function() {
    var middlewareTarget = "testTarget",
      controllerTarget;
    controller.add(function() {
      return middlewareTarget;
    });
    controllerTarget = controller.getTarget();
    expect(controllerTarget).to.be.equal(middlewareTarget);
  });

  it("runs middleware in order", function() {
    var middlewareTarget = "testTarget",
      controllerTarget;
    controller.add(function() {
      return "bad target";
    });
    controller.add(function(target) {
      expect(target).to.be.equal("bad target");
      return middlewareTarget;
    });
    controllerTarget = controller.getTarget();
    expect(controllerTarget).to.be.equal(middlewareTarget);
  });

  it("has the correct attributes", function() {
    var hasCalled1 = false,
      hasCalled2 = false,
      config = { config:true },
      data = { data:true },
      blacklist = [ "black" ];
    controller.add(function(target,options) {
      expect(options.config).to.deep.equal(config);
      expect(options.data).to.deep.equal(data);
      expect(options.blacklist).to.deep.equal(blacklist);
      options.data.extra = true;
      options.blacklist.push("new");
      hasCalled1 = true;
    });
    controller.add(function(target,options) {
      expect(options.data.extra).to.be.ok;
      expect(options.blacklist).to.contain("new");
      hasCalled2 = true;
    });
    controller.getTarget(config,data,blacklist);
    expect(hasCalled1).to.be.ok;
    expect(hasCalled2).to.be.ok;
  });


});