var async = require("async"),
  dbUtils = require("./db-utils"),
  expect = require("chai").expect,
  _ = require("underscore");

describe("couchdb remote sync", function() {
  var driver,
    dbName,
    remoteSync,
    site = "testsite",
    testName = "test_node",
    testStatus = "good",
    testOptions = { opt:true };

  beforeEach(function(done) {
    async.waterfall(
      [
        dbUtils.makeDBDriver,
        function(name,dbDriver,next) {
          driver = dbDriver;
          dbName = name;
          next();
        },
        function(next) {
          driver.getRemoteCouchSync("test-deploy",site,next);
        },
        function(sync,next) {
          remoteSync = sync;
          next();
        }
      ], done
    );
  });
  afterEach(function(done) {
    dbUtils.destroyDb(dbName,done);
  });

  it("should get no node when node is in db",function(done) {
    async.waterfall(
      [
        function(next) {
          remoteSync.getNodeByName(testName,next);
        },
        function(node,next) {
          expect(node).to.not.be.ok;
          next();
        }
      ],done
    );
  });

  it("should be able to set node state",function(done) {
    async.waterfall(
      [
        function(next) {
          remoteSync.setNodeState(testName,testStatus,testOptions,next);
        },
        function(next) {
          remoteSync.getNodeByName(testName,next);
        },
        function(node,next) {
          expect(node).to.be.ok;
          expect(node.status).to.be.equal(testStatus);
          expect(node.options).to.be.deep.equal(testOptions);
          next();
        }
      ],done
    );
  });

  it("should be able to update node state",function(done) {
    async.waterfall(
      [
        function(next) {
          remoteSync.setNodeState(testName,testStatus,testOptions,next);
        },
        function(next) {
          remoteSync.getNodeByName(testName,next);
        },
        function(node,next) {
          expect(node).to.be.ok;
          expect(node.status).to.be.equal(testStatus);
          expect(node.options).to.be.deep.equal(testOptions);
          next();
        },
        function(next) {
          testOptions.url = "test";
          testStatus = "cleanup";
          remoteSync.setNodeState(testName,testStatus,{url:"test"},next);
        },
        function(next) {
          remoteSync.getNodeByName(testName,next);
        },
        function(node,next) {
          expect(node).to.be.ok;
          expect(node.status).to.be.equal(testStatus);
          expect(node.options).to.be.deep.equal(testOptions);
          next();
        }
      ],done
    );
  });

  it("should be able to delete node",function(done) {
    async.waterfall(
      [
        function(next) {
          remoteSync.setNodeState(testName,testStatus,testOptions,next);
        },
        function(next) {
          remoteSync.getNodeByName(testName,next);
        },
        function(node,next) {
          expect(node).to.be.ok;
          expect(node.status).to.be.equal(testStatus);
          expect(node.options).to.be.deep.equal(testOptions);
          next();
        },
        function(next) {
          testOptions.url = "test";
          remoteSync.setNodeState(testName,testStatus,{url:"test"},next);
        },
        function(next) {
          remoteSync.getNodeByName(testName,next);
        },
        function(node,next) {
          expect(node).to.be.ok;
          expect(node.status).to.be.equal(testStatus);
          expect(node.options).to.be.deep.equal(testOptions);
          next();
        },
        function(next) {
          remoteSync.deleteNode(testName,next);
        },
        function(next) {
          remoteSync.getNodeByName(testName,next);
        },
        function(node,next) {
          expect(node).to.not.be.ok;
          next();
        }
      ],done
    );
  });

  it("should be able to manage multiple deploy sites", function(done) {
    var remoteSync2;
    async.waterfall(
      [
        function(next) {
          driver.getRemoteCouchSync("test-deploy2",site+"2",next);
        },
        function(sync,next) {
          remoteSync2 = sync;
          next();
        },
        function(next) {
          remoteSync.setNodeState(testName,testStatus,testOptions,next);
        },
        function(next) {
          remoteSync2.setNodeState(testName+"2",testStatus+"2",
            testOptions,next);
        },
        function(next) {
          remoteSync.getNodeByName(testName,next);
        },
        function(node,next) {
          expect(node).to.be.ok;
          next();
        },
        function(next) {
          remoteSync2.getNodeByName(testName,next);
        },
        function(node,next) {
          expect(node).to.not.be.ok;
          next();
        },
        function(next) {
          remoteSync2.getNodeByName(testName+"2",next);
        },
        function(node,next) {
          expect(node).to.be.ok;
          next();
        },
        function(next) {
          remoteSync.getNodeByName(testName+"2",next);
        },
        function(node,next) {
          expect(node).to.not.be.ok;
          next();
        }
      ],done
    );
  });

  it("should be able to sync nodes",function(done) {
    var mockManager = {},
      nodes;
    mockManager.importNodes = function(importNodes) {
      nodes = importNodes;
    };
    remoteSync.registerManager(mockManager);
    async.waterfall(
      [
        function(next) {
          remoteSync.setNodeState(testName,testStatus,testOptions,next);
        },
        function(next) {
          remoteSync.setNodeState(testName+"2",testStatus+"2",
            testOptions,next);
        },
        function(next) {
          remoteSync.syncNodes(next);
        },
        function(next) {
          var nodes1 = {},
            nodes2 = {};
          nodes1[testName]=testOptions;
          nodes2[testName+"2"]=testOptions;
          expect(nodes).to.be.ok;
          expect(nodes[testStatus]).to.be.deep.equal(nodes1);
          expect(nodes[testStatus+"2"]).to.be.deep.equal(nodes2);
          next();
        }
      ],done
    );
  });

});