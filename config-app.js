
/**
 * Module dependencies.
 */

var async = require('async')
  , express = require('express')
  , url = require("url")
  , http = require('http')
  , couchdbDriver = require("./lib/couchdb-driver")
  , siteConfigureDriver = require("./lib/site-configure-driver")
  , config = require("./lib/config")
  , path = require("path")
  , fs = require("fs")
  , _ = require("underscore")
  ;
console.log("starting server");

var app = express(),
  dbDriver,
  siteConfigure;

dbDriver = couchdbDriver(config);
dbDriver.openDb(console.log);

siteConfigure = siteConfigureDriver(dbDriver);

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.put("/api/v1/site/:site", function(req,res) {
  siteConfigure.setSiteConfig(req.params.site,req.body);
});

app.get("/api/v1/site/:site/nodes", function(req,res) {
  async.waterfall(
    [
      function(next) {
        dbDriver.db.view("deploy_state","by_site", {
          key: req.params.site
        }, next );
      },
      function(body) {
        var nodes = _.pluck(body.rows,"value");
        body.rows.forEach(function(row) {
          delete row._id;
          delete row._rev;
          delete row.type;
        });

        res.json(nodes);
      }
    ]
  );
});

app.put("/api/v1/site/:site/deployicus", function(req,res) {
  async.waterfall(
    [
      function(next) {
        dbDriver.db.view("deploy","by_site", {
          key: req.params.site
        }, next );
      },
      function(body) {
        var row = {};
        if(body.rows.length === 1 ) {
          row = body.rows[0].value;
          row = _.extend(row,req.body);
        } else {
          row = req.body;
          row.type = "deploy";
          row.site = req.params.site;
        }
        dbDriver.db.insert(row);
      }
    ]
  );
});

app.get("/api/v1/site/:site/deployicus", function(req,res) {
  async.waterfall(
    [
      function(next) {
        dbDriver.db.view("deploy","by_site", {
          key: req.params.site
        }, next );
      },
      function(body) {
        var row = {};
        if(body.rows.length === 1 ) {
          row = body.rows[0].value;
          delete row._id;
          delete row._rev;
          delete row.type;
          delete row.site;
        }

        res.json(row);
      }
    ]
  );
});

app.get("/api/v1/site/:site", function(req,res) {
  async.waterfall(
    [
      function(next) {
        dbDriver.db.view("site","by_host", {
          key: req.params.site
        }, next );
      },
      function(body) {
        var site = {};
        if(body.rows.length === 1 ) {
          site = body.rows[0].value;
          delete site._id;
          delete site._rev;
          delete site.type;
          delete site.site;
        }
        res.json(site);
      }
    ]
  );
});

app.get("/api/v1/sites", function(req,res) {
  async.waterfall(
    [
      function(next) {
        dbDriver.db.view("site","by_host", next );
      },
      function(body) {
        res.json(_.pluck(body.rows,"key"));
      }
    ]
  );
});

app.get("/site/*",function(req,res) {
  res.sendfile(path.join(__dirname, 'public','index.html'));
});
http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
