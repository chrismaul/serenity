var async = require("async"),
  deploymentManager = require("../lib/deployer/deployment-manager"),
  expect = require("chai").expect,
  nodeUuid = require("node-uuid"),
  path = require("path"),
  _ = require("underscore");
describe("deployment manangers",function() {
  var mockDeployer,
    deleteCallCount,
    deployCallCount,
    params,
    manager,
    errorOnDeployNode = false,
    registerManager = false,
    remoteSync,
    transformTargetCount;

  function getTargets(max) {
    var i,
      targets={},
      target;
    for(i = 0; i < max; i++ ) {
      target = manager.getTarget();
      if( ! targets[target.node] ) {
        targets[target.node] = 0;
      }
      targets[target.node]++;
    }
    return targets;
  }

  beforeEach(function() {

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
    mockDeployer = {};
    mockDeployer.deleteIntance = function(name,params,done) {
      deleteCallCount++;
      manager.deleteNode(name,done);
    };

    mockDeployer.deployInstance = function(name,params,done) {
      var url = name;
      deployCallCount++;
      expect(name).to.contain("test-app");
      expect(params.code).to.be.equal("test-code");
      async.waterfall(
        [
          function(next) {
            manager.setNodeState(name,"deploying",params,next);
          },
          function(next) {
            if(errorOnDeployNode) {
              errorOnDeployNode = false;
              next(new Error("error on deploy"));
            } else {
              manager.setNodeState(name,"deployed",{url:url},next);
            }
          },
          function(next) {
            next(null,url);
          }
        ],
      done);
    };

    mockDeployer.scale = function(params,scale,done) {
      scaleCallCount++;
      expect(params.name).to.contain("test-app");
      expect(params.code).to.be.equal("test-code");
      done(null);
    };

    mockDeployer.transformTarget = function(target) {
      transformTargetCount++;
      return target;
    }
    deleteCallCount = 0;
    deployCallCount = 0;
    scaleCallCount = 0;
    transformTargetCount = 0;
    params = {scale:1,code:"test-code", version:"test-version"};
  });

  describe("base app version",function() {

    var currentTime,
      maxTime = 10;

    beforeEach(function() {
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
      currentTime = Date.now();
      manager = deploymentManager.base({
        deployName:"test-app",
        maxTime:maxTime,
        remoteSync:remoteSync
      },mockDeployer);

      // now I control time
      manager.getTime = function() { return currentTime; };
    });

    describe("set api",function() {
      var nodeName,
        nodeStatus,
        options,
        version;

      beforeEach( function() {
        nodeName = "testNode";
        version="v1";
        options = { version:version };
        nodeStatus = "good";
      });

      it("should be able to set node state", function(done) {
        async.waterfall(
          [
            function(next) {
              manager.setNodeState(nodeName,nodeStatus,options,next);
            },
            function(next) {
              var siteNodes = manager.getSiteNodes(version);
              expect(siteNodes).to.be.deep.equal( [
                {
                  name:nodeName,
                  status:nodeStatus,
                  version:version,
                }
              ]);
              next();
            }
          ],done
        );
      });

      it("should be able to delete node", function(done) {
        async.waterfall(
          [
            function(next) {
              manager.setNodeState(nodeName,nodeStatus,options,next);
            },
            function(next) {
              var siteNodes = manager.getSiteNodes(version);
              expect(siteNodes).to.be.deep.equal( [
                {
                  name:nodeName,
                  status:nodeStatus,
                  version:version,
                }
              ]);
              next();
            },
            function(next) {
              manager.deleteNode(nodeName,next);
            },
            function(next) {
              var siteNodes = manager.getSiteNodes(version);
              expect(siteNodes).to.be.deep.equal( [] );
              next();
            }
          ],done
        );
      });

      it("should be able to change node state", function(done) {
        async.waterfall(
          [
            function(next) {
              manager.setNodeState(nodeName,nodeStatus,options,next);
            },
            function(next) {
              var siteNodes = manager.getSiteNodes(version);
              expect(siteNodes).to.be.deep.equal( [
                {
                  name:nodeName,
                  status:nodeStatus,
                  version:version,
                }
              ]);
              next();
            },
            function(next) {
              manager.setNodeState(nodeName,"error",options,next);
            },
            function(next) {
              var siteNodes = manager.getSiteNodes(version);
              expect(siteNodes).to.be.deep.equal( [
                {
                  name:nodeName,
                  status:"error",
                  version:version
                }
              ]);
              next();
            }
          ],done
        );
      });

      it("should be able to set options", function(done) {
        async.waterfall(
          [
            function(next) {
              manager.setNodeState(nodeName,nodeStatus,options,next);
            },
            function(next) {
              var siteNodes = manager.getSiteNodes(version);
              expect(siteNodes).to.be.deep.equal( [
                {
                  name:nodeName,
                  status:nodeStatus,
                  version:version
                }
              ]);
              next();
            },
            function(next) {
              manager.setNodeState(nodeName,nodeStatus,{newVar:true},next);
            },
            function(next) {
              var siteNodes = manager.getSiteNodes(version);
              expect(siteNodes).to.be.deep.equal( [
                {
                  name:nodeName,
                  status:nodeStatus,
                  version:version,
                  newVar:true
                }
              ]);
              next();
            }
          ],done
        );
      });
    });

    it("should be able to handle deployment error",function(done) {
      errorOnDeployNode = true;

      async.waterfall(
        [
          function(next) {
            manager.testAndDeploy("test-app-1",params,next);
          },
          function(next) {
            expect(deleteCallCount).to.be.equal(1);
            expect(deployCallCount).to.be.equal(2);
            next();
          }
        ],done
      );
    });


    it("should be able to handle test failures",function(done) {
      var failTest = true,
        testCount = 0;
      params.test = function(name, params, next) {
        testCount++;
        if(failTest) {
          failTest = false;
          next(new Error("fail"));
        } else {
          next();
        }
      };

      async.waterfall(
        [
          function(next) {
            manager.testAndDeploy("test-app-1",params,next);
          },
          function(next) {
            expect(failTest).to.not.be.ok;
            expect(testCount).to.be.equal(2);
            expect(deleteCallCount).to.be.equal(1);
            expect(deployCallCount).to.be.equal(2);
            next();
          },
          function(next) {
            manager.testAndDeploy("test-app-2",params,next);
          },
          function(next) {
            expect(failTest).to.not.be.ok;
            expect(testCount).to.be.equal(3);
            expect(deleteCallCount).to.be.equal(1);
            expect(deployCallCount).to.be.equal(3);
            next();
          }
        ],done
      );
    });
    it("should not delete node right away after it is destroyed",
      function(done){
      async.waterfall(
        [
          function(next) {
            manager.testAndDeploy("test-app-1",params,next);
          },
          function(next) {
            expect(manager.getTarget()).to.be.ok;
            expect(deleteCallCount).to.be.equal(0);
            manager.destroyNode("test-app-1",next);
          },
          function(next) {
            expect(manager.getTarget()).to.not.be.ok;
            expect(deleteCallCount,"delete count before").to.be.equal(0);
            manager.cleanupNodes(next);
          },
          function(next) {
            expect(deleteCallCount,"delete count middle").to.be.equal(0);
            currentTime += (maxTime + 1) * 1000;
            manager.cleanupNodes(next);
          },
          function(next) {
            expect(deleteCallCount,"delete count after").to.be.equal(1);
            expect(manager.getTarget()).to.not.be.ok;

            next();
          }
        ], done
      );
    });
    it("should support a remoteSync for setNodeState",function(done) {
      var hasCalled = false,
        testName = "testName",
        testStatus = "testStatus",
        testOptions = { options:true};

      remoteSync.setNodeState = function(name,status,options,done) {
        expect(name).to.be.equal(testName);
        expect(status).to.be.equal(testStatus);
        expect(options).to.be.equal(testOptions);
        hasCalled = true;
        done();
      };
      async.waterfall(
        [
          function(next) {
            manager.setNodeState(testName,testStatus,testOptions,next);
          },
          function(next) {
            expect(hasCalled,"has called").to.be.true;
            next();
          }
        ], done
      );
    });

    it("should support a remoteSync for deleteNode",function(done) {
      var hasCalled = false,
        testName = "testName";

      remoteSync.deleteNode = function(name,done) {
        expect(name).to.be.equal(testName);
        hasCalled = true;
        done();
      };
      async.waterfall(
        [
          function(next) {
            manager.deleteNode(testName,next);
          },
          function(next) {
            expect(hasCalled,"has called").to.be.true;
            next();
          }
        ], done
      );
    });

    it("should register manager with remoteSync",function() {
      expect(registerManager).to.be.be.true;
    });

    it("should be able to import nodes",function(done) {
      async.waterfall(
        [
          function(next) {
            manager.testAndDeploy("test-app-1",params,next);
          },
          function(next) {
            expect(manager.getTarget()).to.be.ok;
            manager.importNodes({active:{},cleanup:{}});
            expect(manager.getTarget()).to.not.be.ok;
            next();
          }
        ],
      done);
    });
    it("should be able to get all deployed versions",function(done) {
      var version1 = "v1",
        version2 = "v2";
      async.waterfall(
        [
          function(next) {
            var cloneOptions = _.clone(params);
            cloneOptions.version = version1;
            manager.testAndDeploy("test-app-1",cloneOptions,next);
          },
          function(next) {
            var cloneOptions = _.clone(params);
            cloneOptions.version = version2;
            manager.testAndDeploy("test-app-2",cloneOptions,next);
          },
          function(next) {
            var versions = manager.getSiteVersions();
            expect(versions.length).to.be.equal(2);
            expect(versions).to.contain(version1);
            expect(versions).to.contain(version2);
            next();
          }
        ],done
      );
    });

  });

  describe("multi app version",function() {

    beforeEach(function() {

      manager = deploymentManager.multiApp(
        {deployName:"test-app",remoteSync:remoteSync},mockDeployer);
    });

    it("should be able to deploy an app",function(done) {
      async.waterfall(
        [
          function(next) {
            manager.deploy(params,next);
          },
          function(next) {
            expect(manager.getTarget()).to.be.ok;
            next();
          }
        ],done
      );
    });
    it("should be able to scale up an app",function(done) {
      async.waterfall(
        [
          function(next) {
            manager.deploy(params,next);
          },
          function(next) {
            manager.scale(params,2,next);
          },
          function(next) {
            var targets = getTargets(4);
            expect(Object.keys(targets).length).to.be.equal(2);
            next();
          }
        ],done
      );
    });
    it("should be able to scale down an app",function(done) {
      async.waterfall(
        [
          function(next) {
            params.scale=3;
            manager.deploy(params,next);
          },
          function(next) {
            manager.scale(params,1,next);
          },
          function(next) {
            var targets = getTargets(4);
            expect(Object.keys(targets).length).to.be.equal(1);
            next();
          }
        ],done
      );
    });
    
    it("should be able to scale an app to the same number",function(done) {
      async.waterfall(
        [
          function(next) {
            params.scale=3;
            manager.deploy(params,next);
          },
          function(next) {
            manager.scale(params,3,next);
          },
          function(next) {
            var targets = getTargets(4);
            expect(Object.keys(targets).length).to.be.equal(3);
            next();
          }
        ],done
      );
    });
    it("should be able to delete an app",function(done) {
      async.waterfall(
        [
          function(next) {
            params.scale=3;
            manager.deploy(params,next);
          },
          function(next) {
            manager.destroy(params.version,next);
          },
          function(next) {
            expect(manager.getTarget()).to.not.be.ok;
            next();
          }
        ],done
      );
    });

    it("should be able to handle 2 different versions",function(done) {
      var version1 = "v1",
        version2 = "v2";
      async.waterfall(
        [
          function(next) {
            params.version = version1;
            params.scale=2;
            manager.deploy(params,next);
          },
          function(next) {
            var targets = getTargets(3);
            expect(Object.keys(targets).length).to.be.equal(2);
            next();
          },
          function(next) {
            params.version = version2;
            params.scale=2;
            manager.deploy(params,next);
          },
          function(next) {
            var targets = getTargets(6);
            expect(Object.keys(targets).length).to.be.equal(4);
            next();
          },
          function(next) {
            params.version = version2;
            manager.destroy(params.version,next);
          },
          function(next) {
            var targets = getTargets(6);
            expect(Object.keys(targets).length).to.be.equal(2);
            next();
          }
        ],done
      );
    });
  });

  describe("single app version",function() {

    beforeEach(function() {
      manager = deploymentManager.singleApp(
        {
          deployName:"test-app",
          remoteSync:remoteSync
        },mockDeployer
      );
    });

    it("should be able to deploy an app",function(done) {
      async.waterfall(
        [
          function(next) {
            manager.deploy(params,next);
          },
          function(next) {
            expect(manager.getTarget()).to.be.ok;
            next();
          }
        ],done
      );
    });
    it("should be able to scale an app",function(done) {
      async.waterfall(
        [
          function(next) {
            manager.deploy(params,next);
          },
          function(next) {
            manager.scale(params,2,next);
          },
          function(next) {
            var targets = getTargets(4);
            expect(Object.keys(targets).length).to.be.equal(1);
            expect(scaleCallCount).to.be.equal(1);
            next();
          }
        ],done
      );
    });

    it("should be able to delete an app",function(done) {
      async.waterfall(
        [
          function(next) {
            params.scale=3;
            manager.deploy(params,next);
          },
          function(next) {
            manager.destroy(params.version,next);
          },
          function(next) {
            expect(manager.getTarget()).to.not.be.ok;
            next();
          }
        ],done
      );
    });

    it("should be able to handle 2 different versions",function(done) {
      var version1 = "v1",
        version2 = "v2";
      async.waterfall(
        [
          function(next) {
            params.version = version1;
            params.scale=2;
            manager.deploy(params,next);
          },
          function(next) {
            var targets = getTargets(3);
            expect(Object.keys(targets).length).to.be.equal(1);
            next();
          },
          function(next) {
            params.version = version2;
            params.scale=2;
            manager.deploy(params,next);
          },
          function(next) {
            var targets = getTargets(6);
            expect(Object.keys(targets).length).to.be.equal(2);
            next();
          },
          function(next) {
            params.version = version2;
            manager.destroy(params.version,next);
          },
          function(next) {
            var targets = getTargets(6);
            expect(Object.keys(targets).length).to.be.equal(1);
            next();
          }
        ],done
      );
    });

  });
});
