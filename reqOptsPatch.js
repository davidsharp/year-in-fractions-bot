module.exports = T => (function (method, path, params, isStreaming, callback) {
  var self = T
  
  // config values required for app-only auth
var required_for_app_auth = [
  'consumer_key',
  'consumer_secret'
];

// config values required for user auth (superset of app-only auth)
var required_for_user_auth = required_for_app_auth.concat([
  'access_token',
  'access_token_secret'
]);

var FORMDATA_PATHS = [
  'media/upload',
  'account/update_profile_image',
  'account/update_profile_background_image',
];

var JSONPAYLOAD_PATHS = [
  'media/metadata/create',
  'direct_messages/events/new',
  'direct_messages/welcome_messages/new',
  'direct_messages/welcome_messages/rules/new',
];
  var endpoints=require('/app/node_modules/twit/lib/endpoints.js')
  var helpers=require('/app/node_modules/twit/lib/helpers.js')
  
  if (!params) {
    params = {}
  }
  // clone `params` object so we can modify it without modifying the user's reference
  var paramsClone = JSON.parse(JSON.stringify(params))
  // convert any arrays in `paramsClone` to comma-seperated strings
  var finalParams = this.normalizeParams(paramsClone)
  delete finalParams.twit_options

  // the options object passed to `request` used to perform the HTTP request
  var reqOpts = {
    headers: {
      'Accept': '*/*',
      'User-Agent': 'twit-client'
    },
    gzip: true,
    encoding: null,
  }

  if (typeof self.config.timeout_ms !== 'undefined' && !isStreaming) {
    reqOpts.timeout = self.config.timeout_ms;
  }

  if (typeof self.config.strictSSL !== 'undefined') {
    reqOpts.strictSSL = self.config.strictSSL;
  }
  
  // finalize the `path` value by building it using user-supplied params
  // when json parameters should not be in the payload
  if (JSONPAYLOAD_PATHS.indexOf(path) === -1) {
    try {
      path = helpers.moveParamsIntoPath(finalParams, path)
    } catch (e) {
      callback(e, null, null)
      return
    }
  }

  if (path.match(/^https?:\/\//i)) {
    // This is a full url request
    reqOpts.url = path
  } else
  if (isStreaming) {
    // This is a Streaming API request.

    var stream_endpoint_map = {
      user: endpoints.USER_STREAM,
      site: endpoints.SITE_STREAM
    }
    var endpoint = stream_endpoint_map[path] || endpoints.PUB_STREAM
    reqOpts.url = endpoint + path + '.json'
  } else {
    // This is a REST API request.

    if (path.indexOf('media/') !== -1) {
      // For media/upload, use a different endpoint.
      reqOpts.url = endpoints.MEDIA_UPLOAD + path + '.json';
    } else {
      reqOpts.url = endpoints.REST_ROOT + path + '.json';
    }

    if (FORMDATA_PATHS.indexOf(path) !== -1) {
      reqOpts.headers['Content-type'] = 'multipart/form-data';
      reqOpts.form = finalParams;
       // set finalParams to empty object so we don't append a query string
      // of the params
      finalParams = {};
    } else if (JSONPAYLOAD_PATHS.indexOf(path) !== -1) {
      reqOpts.headers['Content-type'] = 'application/json';
      reqOpts.json = true;
      reqOpts.body = finalParams;
      // as above, to avoid appending query string for body params
      finalParams = {};
    } else {
      reqOpts.headers['Content-type'] = 'application/json';
    }
  }

  if (isStreaming) {
    reqOpts.form = finalParams
  } else if (Object.keys(finalParams).length) {
    // not all of the user's parameters were used to build the request path
    // add them as a query string
    var qs = helpers.makeQueryString(finalParams)
    reqOpts.url += '?' + qs
  }

  if (!self.config.app_only_auth) {
    // with user auth, we can just pass an oauth object to requests
    // to have the request signed
    var oauth_ts = Date.now() + self._twitter_time_minus_local_time_ms;

    reqOpts.oauth = {
      consumer_key: self.config.consumer_key,
      consumer_secret: self.config.consumer_secret,
      token: self.config.access_token,
      token_secret: self.config.access_token_secret,
      timestamp: Math.floor(oauth_ts/1000).toString(),
    }

    callback(null, reqOpts);
    return;
  } else {
    // we're using app-only auth, so we need to ensure we have a bearer token
    // Once we have a bearer token, add the Authorization header and return the fully qualified `reqOpts`.
    self._getBearerToken(function (err, bearerToken) {
      if (err) {
        callback(err, null)
        return
      }

      reqOpts.headers['Authorization'] = 'Bearer ' + bearerToken;
      callback(null, reqOpts)
      return
    })
  }
})