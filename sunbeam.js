var fs = require('fs')
  , http = require('http')
  , https = require('https')
  , crypto = require('crypto')
  , mime = require('mime')
  , xml2js = require('xml2js');

delayTimeout = function(ms, func) {
  return setTimeout(func, ms);
};

module.exports = S3Put = (function() {
  function S3Put(awsKey, awsSecret, bucket, secure, timeout) {
    this.awsKey = awsKey;
    this.awsSecret = awsSecret;
    this.bucket = bucket;
    this.secure = secure != null ? secure : true;
    this.timeout = timeout != null ? timeout : 60 * 1000;
  }
  S3Put.prototype.put = function(filePath, resource, headers, callback) {
    var mimeType, k;
    var amzHeaders = {};
    for(k in headers) {
      if(headers[k].indexOf("x-amz") === 0) {
        amzHeaders[k] = headers[k];
      }
    }
    mimeType = mime.lookup(filePath);
    return fs.stat(filePath, __bind(function(err, stats) {
      var contentLength, md5Hash, rs;
      if (err != null) {
        return callback(err);
      }
      contentLength = stats.size;
      md5Hash = crypto.createHash('md5');
      rs = fs.ReadStream(filePath);
      rs.on('data', function(d) {
        return md5Hash.update(d);
      });
      return rs.on('end', __bind(function() {
        var date, httpOptions, k, md5, req, timeout, v;
        md5 = md5Hash.digest('base64');
        date = new Date();
        httpOptions = {
          host: "s3.amazonaws.com",
          path: "/" + this.bucket + "/" + resource,
          headers: {
            "Authorization": "AWS " + this.awsKey + ":" + (this.sign(resource, md5, mimeType, date, amzHeaders)),
            "Date": date.toUTCString(),
            "Content-Length": contentLength,
            "Content-Type": mimeType,
            "Content-MD5": md5,
            "Expect": "100-continue"
          },
          method: "PUT"
        };
        for (k in headers) {
          httpOptions.headers[k] = headers[k];
        }
        timeout = null;
        req = (this.secure ? https : http).request(httpOptions, __bind(function(res) {
          var headers, responseBody;
          if (res.statusCode === 200) {
            clearTimeout(timeout);
            headers = JSON.stringify(res.headers);
            return callback(null, {
              headers: headers,
              code: res.statusCode
            });
          }
          responseBody = "";
          res.setEncoding("utf8");
          res.on("data", function(chunk) {
            return responseBody += chunk;
          });
          return res.on("end", function() {
            var parser;
            parser = new xml2js.Parser();
            return parser.parseString(responseBody, function(err, result) {
              if (err != null) {
                return callback(err);
              }
              return callback(result);
            });
          });
        }, this));
        timeout = delayTimeout(this.timeout, __bind(function() {
          req.abort();
          return callback({
            message: "Timed out after " + this.timeout + "ms"
          });
        }, this));
        return req.on("continue", function() {
          var rs2;
          rs2 = fs.ReadStream(filePath);
          rs2.on('error', callback);
          return rs2.pipe(req);
        });
      }, this));
    }, this));
  };
  S3Put.prototype.sign = function(resource, md5, contentType, date, amzHeaders) {
    var data;
    data = ["PUT", md5, contentType, date.toUTCString(), this.canonicalHeaders(amzHeaders).join("\n"), "/" + this.bucket + "/" + resource].join("\n");
    return crypto.createHmac('sha1', this.awsSecret).update(data).digest('base64');
  };
  S3Put.prototype.canonicalHeaders = function(headers) {
    var k, v;
    return ((function() {
      var _results;
      _results = [];
      for (k in headers) {
        v = headers[k];
        _results.push("" + (k.toLowerCase()) + ":" + v);
      }
      return _results;
    })()).sort();
  };
  return S3Put;
});
