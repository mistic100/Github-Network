var network = new GithubNetwork('network', {
  repository: 'mistic100/jQuery-QueryBuilder',

  autoResize: true,
  
  offset: {
    top: 16
  },

  title: {
    font: {
      size: 11,
      style: 'bold'
    }
  },
  yAxis: {
    width: 150
  }
});

$('#download').on('click', function() {
  this.href = network.view.network.canvas.toDataURL();
  this.download = network.config.repository.replace('/', '_') + '.png';
});

$('form[name=options]').on('change', 'input', function() {
  var options = null;
  
  switch ($(this).attr('name')) {
    case 'onlyme':
      options = {
        onlyMe: $(this).is(':checked')
      };
      break;
      
    case 'labels':
      options = {
        network: {
          labels: {
            enabled: $(this).is(':checked')
          }
        }
      };
      break;
  }
  
  if (options) {
    network.setOptions(options);
  }
});

$('select[name=repository]').selectize({
  labelField: 'full_name',
  valueField: 'full_name',
  searchField: 'full_name',
  sortField: 'score',
  loadThrottle: 500,
  
  load: function(query, callback) {
    if (!query.length) return callback();
    
    if (query.indexOf('fork:') == -1) query+= ' fork:true';
    query+= ' forks:<300';
    
    $.get('https://api.github.com/search/repositories?q=' + encodeURIComponent(query), function(data) {
      callback(data.items);
    });
  },
  
  render: {
    option: function(item, escape) {
      return '<div>' +
        '<span class="title">' +
          '<span class="name"><i class="octicon octicon-repo' + (item.fork ? '-forked' : '') + '"></i> ' + escape(item.name) + '</span>' +
          '<span class="by">' + escape(item.owner.login) + '</span>' +
        '</span>' +
        '<span class="description">' + escape(item.description) + '</span>' +
        '<ul class="meta">' +
          (item.language ? '<li class="language">' + escape(item.language) + '</li>' : '') +
          '<li class="watchers"><span>' + escape(item.watchers) + '</span> watchers</li>' +
          '<li class="forks"><span>' + escape(item.forks) + '</span> forks</li>' +
        '</ul>' +
      '</div>';
    }
  },
  
  onChange: function(value) {
    network.setRepository(value);
  }
});