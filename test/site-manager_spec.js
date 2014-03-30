var async = require("async"),
  siteManager = require("../lib/site-manager"),
  siteRouter = require("../lib/site-router"),
  dbUtils = require("./db-utils"),
  expect = require("chai").expect,
  path = require("path"),
  _ = require("underscore");

describe("site mananger",function() {
  var mockDeployer,
    manager,
    siteConfig,
    driver,
    dbName,
    router;

  beforeEach(function(done) {
    mockDeployer = {},
    mockDeployer.deleteIntance = function(name,params,done) {
      params.manager.deleteNode(name,done);
    };

    mockDeployer.deployInstance = function(name,params,done) {
      var url = name;
      async.waterfall(
        [
          function(next) {
            params.manager.setNodeState(name,"deploying",params,next);
          },
          function(next) {
            params.manager.setNodeState(name,"deployed",{url:url},next);
          },
          function(next) {
            next(null,url);
          }
        ],
      done);
    };

    mockDeployer.scale = function(params,scale,done) {
      done(null);
    };

    mockDeployer.transformTarget = function(target) {
      return target;
    }

    siteConfig = {
      deploy1: {
        deployer:mockDeployer,
        versions: {
          "v1": {
            code:"/tmp"
          }
        }
      },
      deploy2: {
        deployer:mockDeployer,
        versions: {
          "v2": {
            code:"/tmp"
          }
        }
      }
    };

    async.waterfall(
      [
        dbUtils.makeDBDriver,
        function(name,dbDriver,next) {
          driver = dbDriver;
          dbName = name;
          next();
        },
        function(next) {
          router = siteRouter();
          manager = siteManager({
            site:"test-site",
            db:driver,
            router:router}
          );
          next();
        },
      ], done
    );

  });
  afterEach(function(done) {
    dbUtils.destroyDb(dbName,done);
  });

  function processAllWork(done) {
    var noMoreWork = false;
    async.until(
      function() {
        return noMoreWork;
      },
      function(next) {
        console.log("work");
        manager.processQueue(function(error,didWork) {
          noMoreWork = !didWork;
          next();
        });
      },
      done
    );
  }
  function importConfig(siteConfig,done) {
    console.log("import config");
    async.waterfall(
      [
        function(next) {
          manager.importDeployConfig(siteConfig,next);
        },
        processAllWork
      ],done
    );
  }

  it("should deploy the an app with 2 deployers", function(done) {

    async.waterfall(
      [
        function(next) {
          importConfig(siteConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
            expect(manager.deploymentManagers.deploy2).to.be.ok;
          expect(manager.deploymentManagers.deploy2.getSiteVersions()).
            to.be.deep.equal(["v2"]);
          next();
        }
      ],done
    );
  });

  it("should not remove the old version until the new version if finish deploying", 
    function(done) {
    async.waterfall(
      [
        function(next) {
          importConfig(siteConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
            expect(manager.deploymentManagers.deploy2).to.be.ok;
          expect(manager.deploymentManagers.deploy2.getSiteVersions()).
            to.be.deep.equal(["v2"]);
          next();
        },
        function(next) {
          var cloneConfig = _.clone(siteConfig);
          cloneConfig.deploy1.versions.v3={
            code:"/tmp"
          };
          delete cloneConfig.deploy1.versions.v1;
          importConfig(cloneConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1","v3"]);
          expect(manager.deploymentManagers.deploy2).to.be.ok;
          expect(manager.deploymentManagers.deploy2.getSiteVersions()).
            to.be.deep.equal(["v2"]);
          next();
        },
        manager.updateDeployConfig,
        processAllWork,
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v3"]);
          expect(manager.deploymentManagers.deploy2).to.be.ok;
          expect(manager.deploymentManagers.deploy2.getSiteVersions()).
            to.be.deep.equal(["v2"]);
          next();
        }
      ],done
    );
  });

  it("should be able to change the deployed version", function(done) {
    async.waterfall(
      [
        function(next) {
          importConfig(siteConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
            expect(manager.deploymentManagers.deploy2).to.be.ok;
          expect(manager.deploymentManagers.deploy2.getSiteVersions()).
            to.be.deep.equal(["v2"]);
          next();
        },
        function(next) {
          var cloneConfig = _.clone(siteConfig);
          cloneConfig.deploy1.versions.v3={
            code:"/tmp"
          };
          delete cloneConfig.deploy1.versions.v1;
          importConfig(cloneConfig,next);
        },
        manager.updateDeployConfig,
        processAllWork,
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v3"]);
          expect(manager.deploymentManagers.deploy2).to.be.ok;
          expect(manager.deploymentManagers.deploy2.getSiteVersions()).
            to.be.deep.equal(["v2"]);
          next();
        }
      ],done
    );
  });

  it("should use the min scale", function(done) {
    siteConfig.deploy1.versions.v1.minScale = 3;
    async.waterfall(
      [
        function(next) {
          importConfig(siteConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
          expect(manager.deploymentManagers.deploy1.getScale("v1")).to.be.
            equal(3);
          next();
        }
      ],done
    );
  });

  it("should be able to change the min scale", function(done) {
    siteConfig.deploy1.versions.v1.minScale = 3;
    async.waterfall(
      [
        function(next) {
          importConfig(siteConfig,next);
        },
        function(next) {
          var siteNodes = manager.deploymentManagers.deploy1.getSiteNodes("v1");
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
          expect(manager.deploymentManagers.deploy1.getScale("v1")).to.be.
            equal(3);
          next();
        },
        function(next) {
          siteConfig.deploy1.versions.v3={
            code:"/tmp",
            minScale:2
          };
          delete siteConfig.deploy1.versions.v1;
          importConfig(siteConfig,next);
        },
        manager.updateDeployConfig,
        processAllWork,
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v3"]);
          expect(manager.deploymentManagers.deploy1.getScale("v3")).to.be.
            equal(3);
          next();
        }
      ],done
    );
  });

  it("should replace a new version the same scale version replaced",
    function(done) {
    siteConfig.deploy1.versions.v1.minScale = 3;
    async.waterfall(
      [
        function(next) {
          importConfig(siteConfig,next);
        },
        function(next) {
          var siteNodes = manager.deploymentManagers.deploy1.getSiteNodes("v1");
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
          expect(manager.deploymentManagers.deploy1.getScale("v1")).to.be.
            equal(3);
          next();
        },
        function(next) {
          siteConfig.deploy1.versions.v1.minScale = 5;
          importConfig(siteConfig,next);
        },
        function(next) {
          var siteNodes = manager.deploymentManagers.deploy1.getSiteNodes("v1");
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
          expect(manager.deploymentManagers.deploy1.getScale("v1")).to.be.
            equal(5);
          next();
        }
      ],done
    );
  });

  it("should be able to deployed 2 version", function(done) {
    async.waterfall(
      [
        function(next) {
          siteConfig.deploy1.versions.v3={
            code:"/tmp"
          };
          importConfig(siteConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions().sort()).
            to.be.deep.equal(["v1","v3"].sort());
            expect(manager.deploymentManagers.deploy2).to.be.ok;
          expect(manager.deploymentManagers.deploy2.getSiteVersions()).
            to.be.deep.equal(["v2"]);
          next();
        }
      ],done
    );
  });

  it("should be able to add a new deployer", function(done) {
    async.waterfall(
      [
        function(next) {
          delete siteConfig.deploy2;
          importConfig(siteConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
            expect(manager.deploymentManagers.deploy2).to.not.be.ok;
          next();
        },
        function(next) {
          siteConfig.deploy2 = {
            deployer:mockDeployer,
            versions: {
              "v2": {
                code:"/tmp"
              }
            }
          };
          importConfig(siteConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
            expect(manager.deploymentManagers.deploy2).to.be.ok;
          expect(manager.deploymentManagers.deploy2.getSiteVersions()).
            to.be.deep.equal(["v2"]);
          next();
        }
      ],done
    );
  });

  it("should be able to remove a deployer", function(done) {
    async.waterfall(
      [
        function(next) {
          importConfig(siteConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
            expect(manager.deploymentManagers.deploy2).to.be.ok;
          expect(manager.deploymentManagers.deploy2.getSiteVersions()).
            to.be.deep.equal(["v2"]);
          next();
        },
        function(next) {
          delete siteConfig.deploy2;
          importConfig(siteConfig,next);
        },
        function(next) {
          expect(manager.deploymentManagers.deploy1).to.be.ok;
          expect(manager.deploymentManagers.deploy1.getSiteVersions()).
            to.be.deep.equal(["v1"]);
            expect(manager.deploymentManagers.deploy2).to.not.be.ok;
          next();
        }
      ],done
    );
  });

});
