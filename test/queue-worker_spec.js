var async = require("async"),
  dbUtils = require("./db-utils"),
  queueWorker = require("../lib/queue-worker"),
  nodeUuid = require("node-uuid"),
  expect = require("chai").expect,
  _ = require("underscore");

describe("queue worker", function() {
  var driver,
    dbName,
    worker,
    work,
    queueId,
    site = "testsite";

  beforeEach(function(done) {
    queueId = nodeUuid.v4();
    work = {
      deployName:"testDeploy",
      action:"scale",
      version:"v5",
      options:{
        scale:5
      }
    };
    async.waterfall(
      [
        dbUtils.makeDBDriver,
        function(name,dbDriver,next) {
          driver = dbDriver;
          dbName = name;
          worker = queueWorker(driver,"test-site",queueId);
          next();
        }
      ], done
    );
  });
  afterEach(function(done) {
    dbUtils.destroyDb(dbName,done);
  });
  it("should be able to add new work to the queue",function(done) {
    async.waterfall(
      [
        function(next) {
          worker.addWorkToQueue(work,next);
        },
        function(next) {
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          var workItemSearch,
           workOptions = work.options;
          delete work.options;
          workItemSearch = _.where(workItems,work);
          expect(workItemSearch.length).to.be.equal(1);
          expect(workItemSearch[0].options).to.be.deep.equal(workOptions);
          next();
        }
      ],done
    );
  });
  it("should be able to override work if not in progress", function(done) {
    var newOptions = {
      newOptions:true
    };
    async.waterfall(
      [
        function(next) {
          worker.addWorkToQueue(work,next);
        },
        function(next) {
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          var workItemSearch,
           workOptions = work.options;
          delete work.options;
          workItemSearch = _.where(workItems,work);
          expect(workItemSearch.length).to.be.equal(1);
          expect(workItemSearch[0].options).to.be.deep.equal(workOptions);
          next();
        },
        function(next) {
          work.options = newOptions;
          worker.addWorkToQueue(work,next);
        },
        function(next) {
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          var workItemSearch;
          delete work.options;
          workItemSearch = _.where(workItems,work);
          expect(workItemSearch.length).to.be.equal(1);
          expect(workItemSearch[0].options.newOptions).to.be.true;
          expect(workItemSearch[0].options.scale).to.be.undefined;
          next();
        }

      ],done
    );
  });
  it("should not fail if they are no work to start", function(done) {
    async.waterfall(
      [
        function(next) {
          worker.startWorkItem(next);
        },
        function(workItem,next) {
          expect(workItem).to.not.be.ok;
          next();
        }
      ], done
    );
  });

  it("should be able to start work", function(done) {
    var startTime = Date.now(),
      workInProgress;
    async.waterfall(
      [
        function(next) {
          worker.addWorkToQueue(work,next);
        },
        function(next) {
          worker.startWorkItem(next);
        },
        function(workInProgress,next) {
          _.each(work,function(value,key) {
            if(key !== "options") {
              expect(workInProgress[key],key).to.be.equal(work[key]);
            } else {
              expect(workInProgress[key],key).to.be.deep.equal(work[key]);
            }
          });
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          var workItemSearch,
           workOptions = work.options;
          delete work.options;
          workItemSearch = _.where(workItems,work);
          expect(workItemSearch.length).to.be.equal(1);
          expect(workItemSearch[0].queueNodeId).to.be.equal(queueId);
          expect(workItemSearch[0].heartbeat).to.be.greaterThan(startTime);
          next();
        }
      ],done
    );
  });
  it("should not be able to override work in progress",function(done) {
    var newOptions = {
      newOptions:true
    };
    async.waterfall(
      [
        function(next) {
          worker.addWorkToQueue(work,next);
        },
        function(next) {
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          var workItemSearch,
           workOptions = work.options;
          delete work.options;
          workItemSearch = _.where(workItems,work);
          expect(workItemSearch.length).to.be.equal(1);
          expect(workItemSearch[0].options).to.be.deep.equal(workOptions);
          next();
        },
        function(next) {
          worker.startWorkItem(next);
        },
        function(workInProgress,next) {
          work.options = newOptions;
          worker.addWorkToQueue(work,next);
        },
        function(next) {
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          var workItemSearch;
          delete work.options;
          workItemSearch = _.where(workItems,work);
          expect(workItemSearch.length).to.be.equal(1);
          expect(workItemSearch[0].options.newOptions).to.be.undefined;
          expect(workItemSearch[0].options.scale).to.be.equal(5);
          next();
        }

      ],done
    );
  });
  it("should update the heart beat of open work",function(done) {
    var startTime = Date.now(),
      workInProgress;
    async.waterfall(
      [
        function(next) {
          worker.addWorkToQueue(work,next);
        },
        function(next) {
          worker.startWorkItem(next);
        },
        function(workInProgress,next) {
          _.each(work,function(value,key) {
            if(key !== "options") {
              expect(workInProgress[key],key).to.be.equal(work[key]);
            } else {
              expect(workInProgress[key],key).to.be.deep.equal(work[key]);
            }
          });
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          var workItemSearch;
          delete work.options;
          workItemSearch = _.where(workItems,work);
          expect(workItemSearch.length).to.be.equal(1);
          expect(workItemSearch[0].queueNodeId).to.be.equal(queueId);
          expect(workItemSearch[0].heartbeat).to.be.greaterThan(startTime);
          worker.heartbeat(next);
        },
        function(next) {
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          var workItemSearch;
          delete work.options;
          workItemSearch = _.where(workItems,work);
          expect(workItemSearch.length).to.be.equal(1);
          expect(workItemSearch[0].heartbeat).to.be.within(
            startTime,Date.now());
          next();
        }
      ],done
    );
  });
  it("should be able to finish the work",function(done){
      var startTime = Date.now(),
      workInProgress;
    async.waterfall(
      [
        function(next) {
          worker.addWorkToQueue(work,next);
        },
        function(next) {
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          var workItemSearch,
           workOptions = work.options;
          delete work.options;
          workItemSearch = _.where(workItems,work);
          expect(workItemSearch.length).to.be.equal(1);
          expect(workItemSearch[0].options).to.be.deep.equal(workOptions);
          next();
        },
        function(next) {
          worker.startWorkItem(next);
        },
        function(workInProgress,next) {
          worker.finishWork(workInProgress._id,next);
        },
        function(next) {
          worker.getWorkQueueItems(next);
        },
        function(workItems,next) {
          expect(workItems.length).to.be.equal(0);
          next();
        }
      ],done
    );
  });

  it("should be able to abort work",function(done){
      var startTime = Date.now(),
      workInProgress;
    async.waterfall(
      [
        function(next) {
          worker.addWorkToQueue(work,next);
        },
        function(next) {
          worker.startWorkItem(next);
        },
        function(workInProgress,next) {
          expect(workInProgress).to.be.ok;
          worker.abortWork(workInProgress._id,next);
        },
        function(next) {
          worker.startWorkItem(next);
        },
        function(workInProgress,next) {
          expect(workInProgress).to.be.ok;
          next();
        }
      ],done
    );
  });

});