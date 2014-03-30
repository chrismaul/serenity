var _ = require("underscore")
  , webIn = require("http-proxy/lib/http-proxy/passes/web-incoming")
  , webOut = require("http-proxy/lib/http-proxy/passes/web-outgoing")
  , webCommon = require("http-proxy/lib/http-proxy/common")
  , https = require('https')
  , http = require('http')
  , url = require('url')
  , winston = require('winston')
;

module.exports = function(router) {
  return function(req,res,options) {
  var target,
    startTime,
    host = req.host,
    redirectProxy = true,
    proxyReq,
    retry = 0,
    setRetry = true,
    featureFlag,
    options = {
      timeout:2000,
      retryCount:1
    },
    targetOptions = {};

  if(!req.signedCookies.feature) {
    winston.info("setting feature cookie");
    featureFlag = router.getFeature(host);
    if( featureFlag ) {
      req.signedCookies.feature = featureFlag;
      res.cookie("feature",req.cookies.feature, {signed: true});
    }
  }
  req.cookie.feature = featureFlag;
  if(req.signedCookies.feature) {
    targetOptions.featureFlag = featureFlag;
  }
  function proxyRequest(req,res,target) {
    var proxyOpts,
      targetParsed;
    if(!target.addr) {
      return res.send(404);
    }
    targetParsed = url.parse(target.addr);
    req.headers["x-forwarded-proto"] = "https";
    proxyOpts = webCommon.setupOutgoing({},{
      target:targetParsed,
      headers: {
        host: target.node
      }
    },req);
    
    if(targetParsed.protocol === "http:" ) {
      proxyReq = http.request(proxyOpts);
    } else {
      proxyReq = https.request(proxyOpts);
    }
    req.pipe(proxyReq);
    proxyReq.on('error',function() { 
      winston.info("error try again")
      tryAgain(false);
    });
    proxyReq.on('response',function(proxyRes) {
      var badRequest = false;
      winston.info(proxyRes.headers);
      if( proxyRes.headers["x-backside-transport"] &&
        proxyRes.headers["x-backside-transport"].indexOf("FAIL") !== -1) {
        badRequest = true;
      }
      if(badRequest) {
        winston.info("bad request");
        tryAgain();
      } else {
        redirectProxy=false;
        winston.info(webOut);
        if(proxyRes.cookies.setFeatureFlag) {
          req.cookies.feature = proxyRes.cookies.setFeatureFlag;
          res.cookie("feature",req.cookies.feature, {signed: true});
          delete webOut.cookies.setFeatureFlag;
        }
        _.each(webOut, function(item) {
          item(req,res,proxyRes);
        });
        proxyRes.pipe(res);
      }
    });
  }

  function tryAgain(timeout) {
    var failed = true;
    if(redirectProxy && retry < options.retryCount) {
      retry++;
      targetOptions.tempBlacklist = [target.target,target.node];
      newTarget = router.getTarget(host,targetOptions);
      winston.info("trying new host",newTarget);
      proxyRequest(req,res,newTarget);
      if(timeout) {
        failed = false;
      }
      router.addRequest(host,{node:target.node, target:target,
        failed:failed,timeout:timeout});
      startTime = Date.now();
      target = newTarget;
    }
  }
  res.on("finish", function() {
    var endTime = Date.now(),
      responseRate;
    if(!target.addr) {
      return;
    }
    redirectProxy=false;
    winston.info("Request time ",endTime - startTime, " target: ",target);
    if(setRetry) {
      responseRate = ( endTime - startTime ) / options.timeout;
      router.addRequest(host, { node:target.node, target:target,
        responseRate:responseRate } );
    }
  });
  target = router.getTarget(host,targetOptions);

  router.executeRoutes(host,req.url,options);
  if(options.url) {
    req.url = options.url;
  }
  startTime = Date.now();

  proxyRequest(req,res,target);
  
  setRetry = (req.method !== "POST" && target.addr
     && options.retryCount > 0);
  
  if (setRetry) {
    setTimeout(function() {
      if(redirectProxy) {
        proxyReq.abort();
        tryAgain(true);
      }
    }, options.timeout);
  }

}
}
