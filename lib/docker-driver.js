var async = require("async"),
  express = require('express'),
  url = require("url"),
  path = require("path"),
  codeDownloader = require("./code-downloader"),
  couchdbRemoteSync = require("./couchdb-remote-sync"),
  _ = require("underscore");
module.exports = function(dbDriver,app, baseUrl) {
  var downloader = codeDownloader();

  app.get("/docker/:site/:deployName/:name/:apiKey/install.sh",
    function(req, res, done) {
    var remoteSync = couchdbRemoteSync(
        dbDriver.db,
        req.params.deployName,
        req.params.site
      ),
      node;
    async.waterfall(
      [
        function(next) {
          node = remoteSync.getNodeByName(req.params.name,next);
        },
        function(node,next) {
          var installScript,
            dockerUrl,
            dockerCallback;

          if(node && node.options.apiKey === req.params.apiKey) {
            dockerUrl = url.resolve(baseUrl,"docker");
            dockerUrl = url.resolve(dockerUrl+"/",req.params.site);
            dockerUrl = url.resolve(dockerUrl+"/",req.params.deployName);
            dockerUrl = url.resolve(dockerUrl+"/",req.params.name);
            dockerUrl = url.resolve(dockerUrl+"/",req.params.apiKey);
            dpckerCallback = url.resolve(dockerUrl+"/","callback");
            dockerUrl = url.resolve(dockerUrl+"/","docker.tar");
            installScript="";
            installScript+="#!/bin/bash\n";
            installScript+="apt-get update\n";
            installScript+="apt-get install -y "+
              "linux-image-generic-lts-raring "+
              "linux-headers-generic-lts-raring curl \n";
            installScript+="cat > /etc/rc.local << EOF\n";
            installScript+="#!/bin/bash\n";
            installScript+="curl -s https://get.docker.io/ubuntu/ | sudo sh\n";
            installScript+="curl -k "+dockerUrl+" | docker load\n";
            installScript+="curl -k "+dpckerCallback+" \n";
            installScript+="docker run";
            _.each(node.options.env,function(value,key) {
              installScript+=" -e "+key+"="+value;
            });
            installScript+=" -p 80:" + (node.options.port || 80) +
              " -d "+node.options.image+" \n";
            installScript+="EOF\n";
            installScript+="chmod 755 /etc/rc.local\n";
            installScript+="reboot\n";
            res.send(installScript);
          } else {
            next(Error("did not validate the node"));
          }
        }
      ], done
    );
  });

  app.get("/docker/:site/:deployName/:name/:apiKey/docker.tar",
    function(req, res, done) {
    var remoteSync = couchdbRemoteSync(
        dbDriver.db,
        req.params.deployName,
        req.params.site
      ),
      node;
    async.waterfall(
      [
        function(next) {
          node = remoteSync.getNodeByName(req.params.name,next);
        },
        function(node,next) {
          if(node && node.options.apiKey === req.params.apiKey) {

            downloader.downloadCode(node.options,
              req.params.site,
              req.params.deployName,
              next
            );
          } else {
            next(Error("did not validate code"));
          }
        },
        function(code,next) {
          res.sendfile(path.resolve(code,"docker.tar"));
        }
      ], done
    );
  });

  app.get("/docker/:site/:deployName/:name/:apiKey/callback",
    function(req, res, done) {
    var remoteSync = couchdbRemoteSync(
        dbDriver.db,
        req.params.deployName,
        req.params.site
      ),
      node;
    async.waterfall(
      [
        function(next) {
          node = remoteSync.getNodeByName(req.params.name,next);
        },
        function(node,next) {
          if(node && node.options.apiKey === req.params.apiKey) {
            remoteSync.setNodeState(req.params.name,"deployed",{},next);
          } else {
            next(Error("did not validate code"));
          }
        },
        function(next) {
          res.send(200);
        }
      ], done
    );
  });

  return app;
};
