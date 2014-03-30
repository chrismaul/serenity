serenity
========

Manage a service on multiple PaaS layers. This application can deploy multiple versions of your application to multiple clouds. Then it routes a request to the different deployments. All without taking down the application. It is also is able to detect errors on the application, and redeploy. It will reroute the request to a different deployment if one is having issues. Currently they are adapters to Cloud Foundry, Heroku, and SoftLayer.

Requirements
========
- nodejs
- couchdb
- cf command ( for deployments to cloud foundry )

