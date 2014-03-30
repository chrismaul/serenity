module.exports = {
    map: function(doc) {
    if( doc.type === "nodeState" ) {
      emit(doc.site,doc);
    }
  }
};
