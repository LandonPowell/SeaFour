var crypto = require('crypto'),
algos = ["sha1", "md5", "sha256", "sha512", "ripemd160"],
encoding = "hex";

algos.forEach( function( algo ) {
  exports[ algo ] = function(data, salt) {
    var hash;
    if( typeof salt != 'undefined'){
      hash = crypto.createHmac(algo, salt).update(data).digest(encoding);
    }
    else{
      hash = crypto.createHash(algo).update(data).digest(encoding);
    }
    return hash;
  };
});