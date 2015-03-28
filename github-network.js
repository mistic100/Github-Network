/**
 * Class that handle network data loading from Github and generates a Network View
 */
var GithubNetwork = function(container, options) {
  this.container = container;
  this.config = $.extend(true, {}, GithubNetwork.DEFAULTS, options);
  this.view = null;

  var that = this;
  var url = encodeURIComponent('https://github.com/' + this.config.repository + '/network/meta');

  this.getCachedJSON('http://json2jsonp.com/?url=' + url + '&callback=?', function(meta) {
    var nbCommits = 0;

    meta.spacemap.forEach(function(spacemap) {
      spacemap.forEach(function(range) {
        nbCommits = Math.max(nbCommits, range[1]);
      });
    });

    var url = encodeURIComponent('https://github.com/' + that.config.repository + '/network/chunk?start=0&end=' + nbCommits);

    that.getCachedJSON('http://json2jsonp.com/?url=' + url + '&callback=?', function(chunk) {
      var data = {
        meta: meta,
        commits: chunk.commits
      };

      that.view = new NetworkView(that.container, data, that.config);
    });
  });
};

GithubNetwork.DEFAULTS = $.extend(true, {
  repository: null,

  cacheAge: 60
}, NetworkView.DEFAULTS);

/**
 * Download JSON file with local storage cache
 */
GithubNetwork.prototype.getCachedJSON = function(url, callback) {
  var hash = this.hashCode(url);
  var cachedData = window.localStorage[hash];
  var cachedTime = window.localStorage[hash+'_time'];

  if (cachedData && cachedTime > new Date().getTime() - this.config.cacheAge*60000) {
    callback(JSON.parse(cachedData));
  }
  else {
    $.getJSON(url, function (data) {
      window.localStorage[hash] = JSON.stringify(data);
      window.localStorage[hash+'_time'] = new Date().getTime();
      callback(data);
    });
  }
};

/**
 * Simple string hash code
 */
GithubNetwork.prototype.hashCode = function(s) {
  return s.split('').reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
};
