var api = {};
Object.defineProperties(api,
  {
    couchDBServer: {
      get:function() {
        return process.env.COUCHDB_SERVER || "http://localhost:5984";
      }
    },
    couchDBName: {
      get:function() {
        return process.env.COUCHDB_NAME || "serenity";
      }
    },
    baseUrl: {
      get:function() {
        return process.env.BASE_URL || "http://localhost";
      }
    },
    expressSecert: {
      get:function() {
        return process.env.EXPRESS_SECERT || "fdgoijgfjkiucv";
      }
    }
  }
);

module.exports = api;