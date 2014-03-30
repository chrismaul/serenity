module.exports = {
    map: function(doc) {
    if( doc.type === "deploy" ) {
      emit(doc.site,doc);
    }
  }
};
