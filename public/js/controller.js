var app = angular.module("serenity",['ngRoute','ui.bootstrap']);

app.config(function ($routeProvider, $locationProvider) {
  $routeProvider.
    when('/site/:site', {
      redirectTo: '/site/:site/configure'
    });
  $routeProvider.
    when('/site/:site/configure', {
      templateUrl: "/partials/configure.html",
      controller:"siteController"
    });
  $routeProvider.
    when('/site/:site/nodes', {
      templateUrl: "/partials/nodes.html",
      controller:"nodesController"
    });
    $routeProvider.
    when('/site/:site/deployicus', {
      templateUrl: "/partials/deployicus.html",
      controller:"deployicusController"
    });
  $routeProvider.otherwise({
      redirectTo: '/site/localhost/configure'
    });

  $locationProvider.html5Mode(true);
});
function transformObjectToArray(data,single) {
  var retVal = [];
  _.each(data,function(value,key) {
    if(single) {
      value = { value:value };
    }
    value.id = key;
    retVal.push(value);
  });
  return retVal;
}
function transformArrayToObject(data,single) {
  var retVal = false;
  data.forEach(function(item) {
    if(!retVal) {
      retVal = {};
    }
    if(single) {
      retVal[item.id] = item.value;
    } else {
      retVal[item.id] = item;
      delete retVal[item.id].id;
    }
  });
  return retVal;
}


app.controller("deployicusController", function($scope, $routeParams, $http, $rootScope) {
  $rootScope.page = "deployicus";
  $scope.site = $routeParams.site;
  $scope.stageDeploy = [];

  $scope.loadDeploy = function() {
    $http.get("/api/v1/site/"+$scope.site+"/deployicus").success(function(data) {
      console.log("Got deploy",data);
      $scope.stageDeploy = transformObjectToArray(data.stageDeploy);
      delete data.stageDeploy;
      if(data.deployOptions) {
        $scope.deployOptions(JSON.stringify(data.deployOptions));
        delete data.deployOptions;
      }
      $scope = _.extend($scope,data);
    });
  };
  $scope.save = function() {
    var data = {},
      deployOptions;
    ["buildInterval","nextScale","startScale","repo","basedir"].forEach(function(key) {
      if($scope[key]) {
        data[key] = $scope[key];
      }
    });
    try {
      deployOptions = JSON.parse($scope.deployOptions);
    } catch(e) {
    }
    if(deployOptions) {
      data.deployOptions = deployOptions;
    }
    data.stageDeploy = transformArrayToObject($scope.stageDeploy);
    console.log("save deploy",data);
    $http.put("/api/v1/site/"+$scope.site+"/deployicus",data).success(
      $scope.loadDeploy
    );
  };
  $scope.loadDeploy();
});

app.controller("nodesController", function($scope, $routeParams, $http, $rootScope) {
  $rootScope.page = "nodes";
  $scope.site = $routeParams.site;
  $scope.nodes = [];
  $scope.loadNodes = function() {
    console.log("loadNodes","/api/v1/site/"+$scope.site+"/nodes");
    $http.get("/api/v1/site/"+$scope.site+"/nodes").success(function(data) {
      console.log("Got nodes",data);
      $scope.nodes = data;
    });
  };
  $scope.loadNodes();
});

app.controller("siteController", function($scope, $routeParams, $http, $rootScope) {
  $rootScope.page = "configure";
  $scope.save = function() {
    var data = {};
     if($scope.router) {
      data.router = $scope.router;
    }
    data.deployConfig = $scope.deployConfig;
    _.each(data.deployConfig, function(deployConfig) {
      deployConfig.deployConfig.env =
        transformArrayToObject(deployConfig.deployConfig.env,true);
      if(!deployConfig.deployConfig.env) {
        delete deployConfig.deployConfig.env;
      }
      deployConfig.versions = transformArrayToObject(
        deployConfig.versions);
      if(!deployConfig.versions) {
        delete deployConfig.versions;
      }
    });
    data.features = transformArrayToObject($scope.features);
    if(!data.features) {
      delete data.features;
    }
    data.routes = transformArrayToObject($scope.routes);
    if(!data.routes) {
      delete data.routes;
    }
    console.log("Update site data",data);
    $http.put("/api/v1/site/"+$scope.site,data).success(
      $scope.loadSite
    );
  };
  $scope.loadSite = function() {
    $http.get("/api/v1/site/"+$scope.site).success(function(data) {
      console.log("Got site",data);
      if(data.router) {
        $scope.router = data.router;
      }
      if(!$scope.router.balance) {
        $scope.router.balance = {};
      }
      if(data.deployConfig) {
        $scope.deployConfig = data.deployConfig;
        _.each($scope.deployConfig, function(deployConfig) {
          deployConfig.deployConfig.env =
            transformObjectToArray(deployConfig.deployConfig.env,true);
          deployConfig.versions = transformObjectToArray(
            deployConfig.versions);
        });
      }
      $scope.features = transformObjectToArray(data.features);
      $scope.routes = transformObjectToArray(data.routes);
    });
  };
  $scope.site = $routeParams.site;
  $scope.router = {balance:{}};
  $scope.deployConfig = {};
  $scope.features = [];
  $scope.routes = [];
  $scope.deleteDeployment = function(name) {
    delete $scope.deployConfig[name];
    delete $scope.router.balance[name];
  };
  $scope.addDeployment = function(name) {
    $scope.deployConfig[name] = {type:"cf",versions:[],deployConfig:{env:[]}};
  };
  $scope.deleteRow = function(arr,item){ 
    var index=arr.indexOf(item)
    arr.splice(index,1);     
  }
  $scope.loadSite();
});

app.controller("serenityController", function($scope,$route, $http) {
  $scope.$route = $route;
  $scope.loadSites = function() {
    $http.get("/api/v1/sites").success(function(data) {
      console.log("Got sites",data);
      $scope.sites = data;
    });
  };
  $scope.loadSites();
  $scope.sites = [];
});
