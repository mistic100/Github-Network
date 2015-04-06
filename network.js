/**
 * Class to draw a full Git network in a canvas
 */
var Network = function(canvas, options, data) {
  this.canvas = canvas;
  this.ctx = this.canvas.getContext('2d');
  this.config = deepmerge({}, Network.DEFAULTS);

  this.resetState();

  if (options) {
    this.setOptions(options, false);
  }

  if (data) {
    this.setData();
  }
};

Network.DEFAULTS = {
  onlyMe: false,

  space: { h: 25, v: 25 },

  network: {

    pointRadius: 3,
    lineWidth: 2,

    labels: {
      enabled: true,
      background: 'rgba(0,0,0,0.8)',
      padding: 5,
      arrowSize: 8,
      font: {
        size: 10,
        family: '"Arial", sans-serif',
        style: 'normal',
        color: '#EEEEEE'
      }
    },


    colors: [ // the first color is only used for origin/master
      '#000000','#c0392b','#3498db','#2ecc71','#8e44ad','#f1c40f','#e67e22',
      '#34495e','#e74c3c','#2980b9','#1abc9c','#9b59b6','#f39c12','#7f8c8d',
      '#2c3e50','#d35400','#e74c3c','#95a5a6','#bdc3c7','#16a085','#27ae60'
    ]
  }
};

/**
 * Reset everything
 */
Network.prototype.resetState = function() {
  this.data = null;

  this.prop = {
    nbCommits: 0,
    nbLines: 0,
    width: 0,
    height: 0
  };

  this.state = {
    drawnLabels: {}
  };
};

/**
 * Load data and refresh
 */
Network.prototype.setData = function(data) {
  this.resetState();

  this.data = data;

  if (!this.data) {
    this.ctx.clearRect(0, 0, this.prop.width, this.prop.height);
    return;
  }

  // find the number of lines in the last block displayed
  var lastBlock = this.config.onlyMe ? this.data.meta.blocks[0] : this.data.meta.blocks.slice(-1)[0];

  this.prop.nbCommits = this.data.commits.length;
  this.prop.nbLines = lastBlock.start + lastBlock.count;
  this.prop.width = (this.prop.nbCommits+1) * this.config.space.h;
  this.prop.height = (this.prop.nbLines+1) * this.config.space.v + 200;

  this.canvas.width = this.prop.width;
  this.canvas.height = this.prop.height;
  this.canvas.style.width = this.prop.width;
  this.canvas.style.height = this.prop.height;

  this.render();
};

/**
 * Load options and refresh
 */
Network.prototype.setOptions = function(options, redraw) {
  this.config = deepmerge(this.config, options);

  if (redraw !== false) {
    this.setData(this.data);
  }
};

/**
 * Draw the whole network
 */
Network.prototype.render = function() {
  this.ctx.clearRect(0, 0, this.prop.width, this.prop.height);

  // draw lines
  this.data.commits.forEach(function(commit) {
    // only selected spaces
    if (commit.space < this.prop.nbLines) {
      commit.parents.forEach(function(parent, i) {
        parent = { time: parent[1], space: parent[2] };

        // only selected spaces
        if (parent.space <= this.prop.nbLines) {
          if (i === 0) {
            if (parent.space === commit.space) {
              this.drawBasicLine(commit, parent);
            }
            else {
              this.drawBranchLine(commit, parent);
            }
          }
          else {
            this.drawMergeLine(commit, parent);
          }
        }
      }, this);
    }
  }, this);

  // draw points
  this.data.commits.forEach(function(commit) {
    if (commit.space < this.prop.nbLines) {
      this.drawPoint(commit);
    }
  }, this);

  // draw labels
  if (this.config.network.labels.enabled) {
    this.data.meta.users.every(function(user, i) {
      var block = this.data.blocksById[user.name];

      user.heads.forEach(function(head) {
        var commit = this.data.commitsById[head.id];

        // only labels not inherited from parent
        if (commit && commit.space >= block.start) {
          this.drawLabel(commit, head.name);
        }
      }, this);

      return !(this.config.onlyMe && i===0);
    }, this);
  }
};

/**
 * Get color for particular space
 */
Network.prototype.getSpaceColor = function(space) {
  return space === 0 ?
    this.config.network.colors[0] : // origin/master
    this.config.network.colors[ space % (this.config.network.colors.length-1) + 1 ]; // other
};

/**
 * Translate "git" coords (space, time) to pixels
 */
Network.prototype.getCoords = function(c) {
  return [
    Math.round((c[0]+0.5) * this.config.space.h),
    Math.round((c[1]+0.5) * this.config.space.v)
  ];
};

/**
 * Draw a commit point
 */
Network.prototype.drawPoint = function(commit) {
  var pos = this.getCoords([commit.time, commit.space]);

  this.ctx.fillStyle = this.getSpaceColor(commit.space);
  this.ctx.beginPath();
  this.ctx.arc(pos[0], pos[1], this.config.network.pointRadius, 0, 2*Math.PI);
  this.ctx.fill();
};

/**
 * Draw a basic line
 */
Network.prototype.drawBasicLine = function(commit, parent) {
  var pos1 = this.getCoords([parent.time, parent.space]);
  var pos2 = this.getCoords([commit.time, commit.space]);

  this.ctx.lineWidth = this.config.network.lineWidth;
  this.ctx.strokeStyle = this.getSpaceColor(commit.space);
  this.drawPath([pos1, pos2]);
  this.ctx.stroke();
};

/**
 * Draw a branching line + arrow
 */
Network.prototype.drawBranchLine = function(commit, parent) {
  var pos1 = this.getCoords([parent.time, parent.space]);
  var pos2 = this.getCoords([parent.time, commit.space]);
  var pos3 = this.getCoords([commit.time, commit.space]);
  var offset = this.config.network.lineWidth*2 + this.config.network.pointRadius;

  this.ctx.lineWidth = this.config.network.lineWidth;
  this.ctx.strokeStyle = this.getSpaceColor(commit.space);
  this.drawPath([pos1, pos2, [pos3[0]-offset, pos3[1]]]);
  this.ctx.stroke();

  this.drawArrow(pos3, 0, this.ctx.strokeStyle);
};

/**
 * Draw a merging line + arrow
 */
Network.prototype.drawMergeLine = function(commit, parent) {
  if (commit.space < parent.space) {
    var pos1 = this.getCoords([parent.time, parent.space]);
    var pos2 = this.getCoords([commit.time-0.4, parent.space]);
    var pos3 = this.getCoords([commit.time-0.4, commit.space+0.6]);
    var pos5 = this.getCoords([commit.time, commit.space]);
  }
  else {
    var pos1 = this.getCoords([parent.time, parent.space]);
    var pos2 = this.getCoords([parent.time, commit.space-0.6]);
    var pos3 = this.getCoords([commit.time-0.4, commit.space-0.6]);
    var pos5 = this.getCoords([commit.time, commit.space]);
  }

  // pos4 is a point between pos3 and pos5 with an offset from pos5
  var offset = this.config.network.lineWidth*2 + this.config.network.pointRadius;
  var angle = Math.atan2(pos5[1]-pos3[1], pos5[0]-pos3[0]);
  var pos4 = this.rotateCoords([pos5[0]-offset, pos5[1]], angle, pos5);

  this.ctx.lineWidth = this.config.network.lineWidth;
  this.ctx.strokeStyle = this.getSpaceColor(parent.space);
  this.drawPath([pos1, pos2, pos3, pos4]);
  this.ctx.stroke();

  this.drawArrow(pos5, angle, this.ctx.strokeStyle);
};

/**
 * Draw a arrow with a particular angle
 */
Network.prototype.drawArrow = function(pos, angle, color) {
  var coords = [
    [pos[0] - this.config.network.lineWidth - this.config.network.pointRadius, pos[1]],
    [pos[0] - this.config.network.lineWidth*3.8 - this.config.network.pointRadius, pos[1] + this.config.network.lineWidth*1.75],
    [pos[0] - this.config.network.lineWidth*3.8 - this.config.network.pointRadius, pos[1] - this.config.network.lineWidth*1.75]
  ];

  if (angle !== 0) {
    coords = this.rotateCoords(coords, angle, pos);
  }
  //coords = coords.map(function(coord) { return coord.map(Math.round) });

  this.ctx.fillStyle = color;
  this.drawPath(coords);
  this.ctx.fill();
};

/**
 * Draw a commit label
 */
Network.prototype.drawLabel = function(commit, name) {
    var pos = this.getCoords([commit.time, commit.space]);

    // everything is adapated to text size
    this.ctx.font = this.getFontStyle(this.config.network.labels.font);
    var m = {
      w: this.ctx.measureText(name).width,
      h: this.config.network.labels.font.size,
      p: this.config.network.labels.padding,
      a: this.config.network.labels.arrowSize,
      l: this.config.network.lineWidth,
      r: this.config.network.pointRadius
    };

    // labels on same commit are stacked
    if (!this.state.drawnLabels[commit.id]) {
      this.state.drawnLabels[commit.id] = 0;
    }
    pos[1]+= this.state.drawnLabels[commit.id];
    this.state.drawnLabels[commit.id]+= m.w + m.a + m.p*2 + m.l;

    // we move and rotate for easier operations
    this.ctx.save();
    this.ctx.translate(pos[0], pos[1] + m.r + m.l);
    this.ctx.rotate(Math.PI / 2);

    // add background
    this.ctx.fillStyle = this.config.network.labels.background;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(m.a, -m.a/2);
    this.ctx.lineTo(m.a, -m.h/2);
    this.ctx.quadraticCurveTo(m.a, -m.h/2-m.p, m.a+m.p, -m.h/2-m.p);
    this.ctx.lineTo(m.w+m.a+m.p, -m.h/2-m.p);
    this.ctx.quadraticCurveTo(m.w+m.a+m.p*2, -m.h/2-m.p, m.w+m.a+m.p*2, -m.h/2);
    this.ctx.lineTo(m.w+m.a+m.p*2, m.h/2);
    this.ctx.quadraticCurveTo(m.w+m.a+m.p*2, m.h/2+m.p, m.w+m.a+m.p, m.h/2+m.p);
    this.ctx.lineTo(m.a+m.p, m.h/2+m.p);
    this.ctx.quadraticCurveTo(m.a, m.h/2+m.p, m.a, m.h/2);
    this.ctx.lineTo(m.a, m.a/2);
    this.ctx.fill();

    // add text
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = this.config.network.labels.font.color;
    this.ctx.fillText(name, m.a+m.p, 0);

    // don't forget to restore matrix
    this.ctx.restore();
};

/**
 * Utility to draw a simple path
 */
Network.prototype.drawPath = function(coords) {
  this.ctx.beginPath();

  coords.forEach(function(coord, i) {
    i===0 ? this.ctx.moveTo(coord[0], coord[1]) : this.ctx.lineTo(coord[0], coord[1]);
  }, this);
};

/**
 * Utility to rotate a point
 */
Network.prototype.rotateCoords = function(coords, angle, origin) {
  var one = typeof coords[0] !== 'object';
  if (one) {
    coords = [coords];
  }

  var matrix = [
    [Math.cos(angle), -Math.sin(angle)],
    [Math.sin(angle), Math.cos(angle)]
  ];

  coords.forEach(function(coord, i) {
    coord = [
      coords[i][0] - origin[0],
      coords[i][1] - origin[1]
    ];

    coords[i][0] = matrix[0][0] * coord[0] + matrix[0][1] * coord[1] + origin[0];
    coords[i][1] = matrix[1][0] * coord[0] + matrix[1][1] * coord[1] + origin[1];
  });

  return one ? coords[0] : coords;
};

/**
 * Utility to get canvas font property
 */
Network.prototype.getFontStyle = function(font) {
  return [
    font.style,
    font.size+'px',
    font.family
  ].join(' ');
};