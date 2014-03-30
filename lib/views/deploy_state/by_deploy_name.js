module.exports = {
    map: function(doc) {
    if( doc.type === "nodeState" ) {
      emit([doc.deployName,doc.site],doc);
    }
  }
};
