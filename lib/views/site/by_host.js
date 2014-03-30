module.exports = {
    map: function(doc) {
    if( doc.type === "site" ) {
      emit(doc.host,doc);
    }
  }
};
