module.exports = {
    map: function(doc) {
    if( doc.type === "work" ) {
      emit([doc.site,doc.deployName, doc.version],doc);
    }
  }
};
