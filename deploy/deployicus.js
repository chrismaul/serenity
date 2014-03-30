var deployCode = require("./deployCode")
  , async = require('async')
  , express = require('express')
  , url = require("url")
  , http = require('http')
  , couchdbDriver = require("../lib/couchdb-driver")
  , config = require("../lib/config")
  , path = require("path")
  , fs = require("fs")
  , _ = require("underscore")
  ;
console.log("starting server");

var app = express(),
  dbDriver,
  deployer;

dbDriver = couchdbDriver(config);
async.waterfall(
  [
    function(next) {
      dbDriver.openDb(next);
    },
    function(next) {
      deployer = deployCode(dbDriver);
      deployCode.start();
      next();
    }
  ]
);

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

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

