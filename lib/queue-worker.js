var async = require("async"),
  winston = require('winston'),
  _ = require("underscore");

module.exports = function(dbDriver,site,queueNodeId) {
  var api = {},
    currentWork = [];

  api.getWorkQueueItems = function(done) {
    async.waterfall(
      [
        function(next) {
          dbDriver.db.view("work_queue","by_site",
            {
              key: site
            },
            next
          );
        },
        function(body,info,next) {
          var work = [];
          if(body.rows.length > 0 ) {
            work = _.pluck(body.rows,"value");
          }
          next(null,work);
        }
      ],done
    );
  };

  api.addWorkToQueue = function(work,done) {
    async.waterfall(
      [
        function(next) {
          dbDriver.db.view("work_queue","by_options",
            {
              key: [ site, work.deployName, work.version ]
            },
            next
          );
        },
        function(body,info,next) {
          var workToAdd;
          if(body.rows.length === 0 ) {
            workToAdd = _.clone(work);
            workToAdd.type = "work";
            workToAdd.site = site;
            workToAdd.queueNodeId = false;

          } else if(!body.rows[0].value.queueNodeId) {
            workToAdd = _.extend(body.rows[0].value,work);
          }
          if(workToAdd) {
            dbDriver.db.insert(workToAdd,
              function() {
                next();
              }
            );
          } else {
            next();
          }
        }
      ],done
    );
  };
  api.startWorkItem = function(done) {
    var workItem;
    async.waterfall(
      [
        function(next) {
          api.getWorkQueueItems(next);
        },
        function(work,next) {
          if( work.length > 0 ) {
            workItem = work.pop();
            workItem.queueNodeId = queueNodeId;
            workItem.abortCount = 0;
            workItem.heartbeat = Date.now();
            dbDriver.db.insert(workItem,
              function(error,body,info) {
                if(error) {
                  workItem = null;
                }
                next(null,body,info);
              }
            );
          } else {
            next(null,null,null);
          }
        },
        function(body,info,next) {
          if( workItem ) {
            dbDriver.db.get(workItem._id,next);
          } else {
            next(null,null,null);
          }
        },
        function(body,info,next) {
          if(workItem && body) {
            if(body.queueNodeId === queueNodeId ) {
              currentWork.push(workItem._id);
              return next(null,workItem);
            } else {
              winston.info("did not get lock");
              return next(null,null);
            }
          } else {
            return next(null,null);
          }
        }
      ],done
    );
  };

  api.heartbeat = function(done) {
    async.each(currentWork, function(work,callback) {
      async.waterfall(
        [
          function(next) {
            dbDriver.db.get(work,next);
          },
          function(body,info,next) {
            if(body) {
              body.heartbeat = Date.now();
              dbDriver.db.insert(body,
                function() {
                  next();
                }
              );
            } else {
              next();
            }
          }
        ], callback
      );
    },done);
  };

  api.abortWork = function(work,done) {
    async.waterfall(
      [
        function(next) {
          dbDriver.db.get(work,next);
        },
        function(body,info,next) {
          if(body) {
            if(body.abortCount > 5) {
              winston.info("could not finish work");
              dbDriver.db.destroy(body._id,body._rev,next);
            } else {
              body.abortCount++;
              body.queueNodeId = false;
              dbDriver.db.insert(body,next);
            }
          } else {
            next(null,null,null);
          }
        },
        function(body,info,next) {
          currentWork= _.reject(currentWork,function(item) {
            return item === work;
          });
          next();
        }
      ],done
    );
  };

  api.finishWork = function(work,done) {
    //todo validate if it should finish the work
    async.waterfall(
      [
        function(next) {
          dbDriver.db.get(work,next);
        },
        function(body,info,next) {
          if(body) {
            dbDriver.db.destroy(body._id,body._rev,next);
          } else {
            next(null,null,null);
          }
        },
        function(body,info,next) {
          currentWork= _.reject(currentWork,function(item) {
            return item === work;
          });
          next();
        }
      ], done
    );
  };
  if(process.env.NODE_ENV !== "testing") {
    async.forever(function(done) {
      api.heartbeat(function() {
        setTimeout(done,10000);
      });
    });
  }
  return api;
};
