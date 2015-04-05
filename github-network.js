/**
 * Class that handle network data loading from Github and generates a Network View
 */
var GithubNetwork = function(container, options) {
  this.container = (typeof container == 'string') ? document.getElementById(container) : container;
  this.config = deepmerge({}, GithubNetwork.DEFAULTS);
  this.view = new NetworkView(this.container);

  if (options) {
    this.setOptions(options);
  }
};

GithubNetwork.DEFAULTS = deepmerge({
  repository: null,

  cacheAge: 60
}, NetworkView.DEFAULTS);

/**
 * Change respository
 */
GithubNetwork.prototype.setRepository = function(repository) {
  this.setOptions({
    repository: repository
  });
};

/**
 * Load options
 */
GithubNetwork.prototype.setOptions = function(options) {
  this.config = deepmerge(this.config, options);

  if (options.repository) {
    this.load();
  }

  this.view.setOptions(this.config);
};

/**
 * Load data and refresh
 */
GithubNetwork.prototype.load = function() {
  var url = 'https://github.com/' + this.config.repository + '/network/meta';
  this.getCachedJSON(url, function(meta) {
    var nbCommits = 0;

    meta.spacemap.forEach(function(spacemap) {
      spacemap.forEach(function(range) {
        nbCommits = Math.max(nbCommits, range[1]);
      });
    });

    var url = 'https://github.com/' + this.config.repository + '/network/chunk?start=0&end=' + nbCommits;
    this.getCachedJSON(url, function(chunk) {
      var data = {
        meta: meta,
        commits: chunk.commits
      };

      this.view.setData(data);
    });
  });
};

/**
 * Download JSON file with local storage cache
 */
GithubNetwork.prototype.getCachedJSON = function(url, callback) {
  var self = this;
  var hash = this.hashCode(url);
  var cachedData = window.localStorage[hash];
  var cachedTime = window.localStorage[hash+'_time'];

  if (cachedData && cachedTime > new Date().getTime() - this.config.cacheAge*60000) {
    callback.call(this, JSON.parse(cachedData));
  }
  else {
    url = encodeURIComponent(url);
    url = 'http://json2jsonp.com/?url=' + url + '&callback=_ghnetJSONP';

    window._ghnetJSONP = function(data) {
      window._ghnetJSONPsrc.parentNode.removeChild(window._ghnetJSONPsrc);
      delete window._ghnetJSONP;
      delete window._ghnetJSONPsrc;

      window.localStorage[hash] = JSON.stringify(data);
      window.localStorage[hash+'_time'] = new Date().getTime();
      callback.call(self, data);
    };

    window._ghnetJSONPsrc = document.createElement('script');
    window._ghnetJSONPsrc.src = url;
    document.body.appendChild(window._ghnetJSONPsrc);
  }
};

/**
 * Simple string hash code
 */
GithubNetwork.prototype.hashCode = function(s) {
  return s.split('').reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
};