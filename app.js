
/**
 * Module dependencies.
 */

var async = require('async')
  , express = require('express')
  , proxy = require('./lib/proxy')
  , url = require("url")
  , https = require('https')
  , http = require('http')
  , couchdbDriver = require("./lib/couchdb-driver")
  , config = require("./lib/config")
  , siteRouter = require("./lib/site-router")
  , dockerDriver = require("./lib/docker-driver")
  , path = require("path")
  , winston = require('winston')
  , fs = require("fs")
  ;
winston.info("starting server");
winston.level = "error";
var app = express(),
  router,
  dbDriver,
  proxyRouter;

dbDriver = couchdbDriver(config);

router = siteRouter(dbDriver);

async.waterfall(
  [
    function(next) {
      dbDriver.openDb(next);
    },
    function(next) {
      dbDriver.db.view("site","by_host",next);
    },
    function(body,headers,next) {
      body.rows.forEach(function(row) {
        router.makeSiteManager(row.key);
      });
    }
  ]
);

proxyRouter = proxy(router);

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.cookieParser(config.expressSecert));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});
dockerDriver(dbDriver,app,config.baseUrl);
app.use(proxyRouter);

var options = {
  key: fs.readFileSync(path.resolve(__dirname,'resources','privkey.pem')),
  cert: fs.readFileSync(path.resolve(__dirname,'resources','server.crt'))
};

https.createServer(options,app).listen(app.get('port'), function(){
  winston.info("Express server listening on port " + app.get('port'));
});
/*
http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
*/
