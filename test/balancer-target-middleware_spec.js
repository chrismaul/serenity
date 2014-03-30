var balancerTargetMiddleware = require("../lib/balancer-target-middleware"),
  expect = require("chai").expect,
  _ = require("underscore");

describe("balancer target middleware", function() {
  var options;

  beforeEach(function() {
    options = {
      config: {
        nodes: [ "node1", "node2" ],
        balance: { "node1":1, "node2":2 }
      },
      data: {},
      blacklist: []
    };
  });

  function getBalanceRunCount() {
    var requestCount = 0
    _.each(options.config.balance,function(value,node) {
      requestCount+=value;
    });
    requestCount = requestCount * 2;
    return requestCount;
  }

  function getBalanceResults() {
     var targetResults = {},
      cnt = 0,
      requestCount = getBalanceRunCount(),
      target;
    options.config.nodes.forEach(function(node) {
      targetResults[node] = 0;
    });

    for(cnt = 0 ; cnt < requestCount; cnt++) {
      target = balancerTargetMiddleware(false,options);
      expect(target).to.be.ok;
      targetResults[target]+=1;
    }
    return targetResults;
  }

  it("should not pick a new target if one exists", function() {
    var target = "testTarget",
      newTarget;
    newTarget = balancerTargetMiddleware(target,options);
    expect(newTarget).to.be.equal(target);
  });

  it("should not pick a new target if they are no nodes", function() {
    var target;
    options.config.nodes = false;
    target = balancerTargetMiddleware(false,options);
    expect(target).to.not.be.ok;
  });

  it("should not pick a new target if balance is not configured", function() {
    var target;
    options.config.balance = false;
    target = balancerTargetMiddleware(false,options);
    expect(target).to.not.be.ok;
  });
  it("should balance corectly between the 2 nodes", function() {
    var targetResults = getBalanceResults();
    _.each(options.config.balance,function(value,node) {
      expect(targetResults[node]).to.be.equal(value * 2);
    });
  });

  it("should not balance to a node in the blacklist", function() {
    var targetResults;
    options.blacklist = [ "node1" ];
    targetResults = getBalanceResults();
    expect(targetResults["node1"]).to.be.equal(0);
    expect(targetResults["node2"]).to.be.equal(getBalanceRunCount());
  });

  it("should not balance to a node which is not configures", function() {
    var targetResults;
    options.config.nodes.push("node3");
    targetResults = getBalanceResults();
    expect(targetResults["node3"]).to.be.equal(0);
  });

});