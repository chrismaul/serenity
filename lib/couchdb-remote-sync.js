var async = require("async"),
  winston = require('winston'),
  _ = require("underscore");

module.exports = function(db,deployName,site) {
  winston.info("using deployName",deployName);
  var api = {},
    manager;

  api.deployName = deployName;
  api.getNodeByName = function(name,done) {
    async.waterfall(
      [
        function(next) {
          db.view("deploy_state","by_deploy_name_and_node",
            {
              key: [ api.deployName, site, name ]
            },
            next
          );
        },
        function(body,info,next) {
          var node;
          if(body.rows.length > 0 ) {
            node = body.rows[0].value;
          }
          next(null,node);
        }
      ], done
    );
  };
  function updateNode(nodeId,status,options,done) {
    var finished = false,
      cnt = 0;
    async.until(
      function() {
        return finished;
      },
      function(callback) {
        async.waterfall(
          [
            function(next) {
              db.get(nodeId,next);
            },
            function(node,index,next) {
              node.options = _.extend(node.options,options);
              node.status = status;
              db.insert(node,function(error) {
                if(error && cnt < 5) {
                  finished = false;
                } else {
                  finished = true;
                }
                next();
              });
            }
          ], callback
        );
      },
      done
    );
  }
  api.setNodeState = function(name,status,oldOptions,done) {
    var options = _.clone(oldOptions);
    if(options.manager) {
      delete options.manager;
    }
    async.waterfall(
      [
        function(next) {
          api.getNodeByName(name,next);
        },
        function(node,next) {
          if( node ) {
            updateNode(node._id,status,options,next);
          } else {
            node = {
              type:"nodeState",
              deployName:api.deployName,
              site:site,
              status:status,
              name:name,
              options:options
            }
            db.insert(node,function(error) {
              next(error);
            });
          }          
        }
      ], done
    );
  };

  api.deleteNode = function(name, done) {
    async.waterfall(
      [
        function(next) {
          api.getNodeByName(name,next);
        },
        function(node,next) {
          if( node ) {
            db.destroy(node._id,node._rev,next);
          } else {
            next(null,null,null);
          }
        },
        function(body,info,next) {
          next();
        }
      ],done
    );
  };

  api.registerManager = function(registerManager) {
    manager = registerManager;
  };
  /*
   * nodes format
   * { state: { nodeName: node } }
   */
  api.syncNodes = function(done) {
    var nodes = { active: {}, cleanup:{} };
    async.waterfall(
      [
        function(next) {
          db.view("deploy_state","by_deploy_name",
            {
              key: [ api.deployName, site ]
            },
            next
          );
        },
        function(body,info,next) {
          body.rows.forEach(function(item) {
            var row = item.value;
            if(!nodes[row.status]) {
              nodes[row.status] = {};
            }
            nodes[row.status][row.name] = row.options;
          });
          manager.importNodes(nodes);
          next();
        }
      ], done
    );
  };
  return api;
};
