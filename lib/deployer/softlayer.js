var async = require("async"),
  nodeUuid = require("node-uuid"),
  deployUtils = require("./utils"),
  request = require("request"),
  url = require("url"),
  winston = require('winston'),
  _ = require("underscore");

module.exports = function(options) {

  var api = {};

  function softlayerRequest(endpoint,opts,done) {
    opts.url = url.resolve("https://api.softlayer.com/rest/v3/",endpoint);
    opts.auth = {
      user:options.user,
      password:options.password
    };
    request(opts,done);
  }

  api.deployInstance = function(name,params,done) {
    var apiKey = nodeUuid.v4(),
      softlayerId,
      ipAddr;

    async.waterfall(
      [
        function(next) {
          params.apiKey = apiKey;
          params.env = params.env || options.env || {};
          params.manager.setNodeState(name,"deploying",params,next);
        },
        function(next) {
          var installUrl = url.resolve(options.baseUrl,name);
          installUrl = url.resolve(installUrl+"/",apiKey);
          installUrl = url.resolve(installUrl+"/","install.sh");
          softlayerRequest("SoftLayer_Virtual_Guest.json",{
              json:{
                parameters: [ {
                  domain:options.domain,
                  hostname:name,
                  hourlyBillingFlag:true,
                  startCpus:1,
                  maxMemory:1024,
                  localDiskFlag:true,
                  operatingSystemReferenceCode:"UBUNTU_12_64",
                  datacenter: {
                    name: options.datacenter || "dal05"
                  },
                  networkComponents:[
                    {
                      maxSpeed: 100
                    }
                  ],
                  primaryBackendNetworkComponent: { 
                      networkVlan: { 
                        id: 287494 
                      } 
                  },
                  localDiskFlag:true,
                  privateNetworkOnlyFlag:true,
                  postInstallScriptUri:installUrl
                }]
              },
              method: "POST"
            }, next
          );
        },
        function(response, data, next) {
          winston.info(data);
          if(response.statusCode === 201 ) {
            softlayerId = data.globalIdentifier;
            params.manager.setNodeState(name,"deploying",
              {softlayerId:softlayerId},next);
            next();
          } else {
            next(new Error("Error creating app " + JSON.stringify(data)));
          }

        },
        function(next) {
          var node = params.manager.getNode(name),
            timeout = 0;
          async.until(
            function() {
              return node.status === "deployed";
            },
            function(callback) {
              node = params.manager.getNode(name);
              setTimeout(function() {
                timeout++;
                if(timeout > 40) {
                  callback(Error("deployment timed out"));
                } else {
                  callback();
                }
              }, 30000);
            },next
          );
        },
        function(next) {
          getSoftlayerNode(softlayerId,next);
        },
        function(response, dataString, next) {
          var data = JSON.parse(dataString);
          ipAddr = data.primaryBackendIpAddress;
          winston.info(data,ipAddr);
          params.manager.setNodeState(name,"deployed",
              {ipAddr:ipAddr},next);
        },
        function(next) {
          winston.info("return address");
          var addr = "http://"+ipAddr;
          next(null,addr);
        }
      ],
    done);
  };
  function getSoftlayerNode(softlayerId,next) {
    softlayerRequest("SoftLayer_Virtual_Guest/"+
      softlayerId+"/getObject",
      {
        method: "GET"
      }, next
    );
  }
  api.deleteIntance = function(name,params,done) {
    var node = params.manager.getNode(name);
    if(!node.softlayerId) {
      winston.info("no softlayer id");
      return params.manager.deleteNode(name,done);
    }
    async.waterfall(
      [
        function(next) {
          softlayerRequest("SoftLayer_Virtual_Guest/"+
            node.softlayerId+"/deleteObject",
            {
              method: "GET" // needs to be get
            }, function(error) {
              next(null,error);
            }
          );
        },
        function(error,next) {
          if(error) {
            params.manager.setNodeState(name,"errorDelete",{},next);
          } else {
            params.manager.deleteNode(name,next);
          }
        }
      ], done
    );
  };

  api.transformTarget = function(target,manager) {
    var node;
    if(target) {
      node = manager.getNode(target);
      if(node.ipAddr) {
        target = "http://"+node.ipAddr;
      }
    }
    return target;
  };

  return api;
};
