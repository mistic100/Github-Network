/**
 * View for Network with axis, drag-nav, commits messages, etc.
 */
var NetworkView = function(container, data, options) {
  this.container = container;
  this.data = data;
  this.data.commitsById = {};
  this.data.blocksById = {};
  this.data.usersById = {};
  this.drawnLabels = {};
  this.config = $.extend(true, {}, NetworkView.DEFAULTS, options);

  // axis size needs to be relevant
  if (!this.config.xAxis.enabled) this.config.xAxis.height = 0;
  if (!this.config.yAxis.enabled) this.config.yAxis.width = 0;

  this.data.meta.blocks.forEach(function(block, i) {
    // add index and end to blocks
    block.index = i;
    block.end = block.start + block.count - 1;

    // store blocks by user name
    this.data.blocksById[block.name] = block;
  }, this);

  this.data.commits.forEach(function(commit) {
    // store commits by id
    this.data.commitsById[commit.id] = commit;
  }, this);

  this.data.meta.users.forEach(function(user) {
    // store users by name
    this.data.usersById[user.name] = user;
  }, this);

  // find the number of lines in the last block displayed
  var lastBlock = this.config.onlyMe ? this.data.meta.blocks[0] : this.data.meta.blocks.slice(-1)[0];

  this.prop = {
    nbCommits: this.data.commits.length,
    nbLines: lastBlock.start + lastBlock.count,
    width: this.container.offsetWidth,
    height: this.container.offsetHeight,
    top: this.container.offsetTop,
    left: this.container.offsetLeft,
    gridWidth: 0,
    gridHeight: 0,
    maxScroll: {}
  };

  this.prop.gridWidth = this.prop.width - this.config.yAxis.width;
  this.prop.gridHeight = this.prop.height - this.config.xAxis.height;

  this.state = {
    scrollTop: 0,
    scrollLeft: 0,
    dragging: false,
    mouseX: 0,
    mouseY: 0,
    activeCommit: null,
    minTime: 0,
    maxTime: this.prop.nbCommits,
    minSpace: 0,
    maxSpace: this.prop.nbLines
  };

  // view is horizontally centered on last origin/master commit
  this.state.scrollLeft = -Math.round((this.data.meta.focus+1) * this.config.space.h - this.prop.gridWidth/2);

  // container must be positionned
  if (['','static'].indexOf(this.container.style.position) !== -1) {
    this.container.style.position = 'relative';
  }

  // create canvas
  this.canvas = $('<canvas></canvas>').appendTo(this.container)[0];
  this.ctx = this.canvas.getContext('2d');

  this.canvas.width = this.prop.width;
  this.canvas.height = this.prop.height;
  this.canvas.style.cursor = 'move';

  // create holder of the whole network
  var networkCanvas = $('<canvas></canvas>').hide().insertAfter(this.canvas);
  this.network = new Network(networkCanvas[0], this.data, this.config);

  this.prop.maxScroll = {
    t: 0,
    b: -this.network.prop.height + this.prop.height + this.config.xAxis.height,
    l: this.prop.gridWidth/2 - this.config.space.h*2,
    r: -this.network.prop.width + this.prop.gridWidth/2
  };

  // create div for tooltip
  if (this.config.tooltip.enabled) {
    this.tooltip = $(
      '<div class="network-tooltip">'+
        '<aside><img src=""></aside>'+
        '<header></header>'+
        '<section><h5></h5><p></p></section>'+
      '</div>'
    ).hide().insertBefore(this.canvas);
  }

  // add event listeners
  this.canvas.addEventListener('mousedown', this.mouseDown.bind(this));
  this.canvas.addEventListener('mousemove', this.mouseMove.bind(this));
  this.canvas.addEventListener('mouseup', this.mouseUp.bind(this));

  this.drawAll();
};

NetworkView.DEFAULTS = $.extend(true, {
  border: {
    width: 1,
    color: '#DDDDDD'
  },

  title: {
    enabled: true,
    text: 'Network',
    background: '#F7F7F7',
    font: {
      size: 18,
      family: '"Arial", sans-serif',
      style: 'bold italic',
      color: '#333333'
    }
  },

  tooltip: {
    enabled: true,
    offset: {
      top: 20,
      left: -20
    },
    defaultGravatar: 'https://i2.wp.com/assets-cdn.github.com/images/gravatars/gravatar-user-420.png'
  },

  grid: {
    enabled: true,
    background: ['#FFFFFF', '#F9F9F9'],
    backgroundActive: '#EEEEEE',
    border: {
      width: 1,
      color: '#DDDDDD',
    }
  },

  xAxis: {
    enabled: true,
    height: 40,
    background: '#F7F7F7',
    days: {
      enabled: true
    },
    font: {
      size: 12,
      family: '"Arial", sans-serif',
      style: 'normal',
      color: '#333333'
    },
    ticks: {
      enabled: true,
      width: 1,
      height: 6,
      color: '#DDDDDD'
    }
  },

  yAxis: {
    enabled: true,
    width: 120,
    background: ['#FFFFFF', '#F9F9F9'],
    backgroundActive: '#EEEEEE',
    names: {
      enabled: true
    },
    font: {
      size: 12,
      family: '"Arial", sans-serif',
      style: 'normal',
      color: '#333333'
    },
    border: {
      width: 1,
      color: '#DDDDDD',
    }
  },

  lang: {
    shortMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  }
}, Network.DEFAULTS);

/**
 * Draw everything
 */
NetworkView.prototype.drawAll = function() {
  this.computeMinMax();

  this.ctx.clearRect(0, 0, this.prop.width, this.prop.height);

  this.drawGrid();
  this.drawYAxis();
  this.drawXAxis();
  this.drawTitle();
  this.drawNetwork();
  this.drawActiveCommit();
  this.drawBorders();
};

/**
 * Draw the main part
 */
NetworkView.prototype.drawNetwork = function() {
  // copy the visible chunk from the network canvas
  var sourceX = -this.state.scrollLeft;
  var sourceY = -this.state.scrollTop;
  var sourceWidth = destWidth = this.prop.gridWidth;
  var sourceHeight = destHeight = this.prop.gridHeight;
  var destX = this.config.yAxis.width;
  var destY = this.config.xAxis.height;

  if (sourceX < 0) {
    sourceWidth = destWidth = this.prop.gridWidth + sourceX;
    destX-= sourceX;
    sourceX = 0;
  }
  else if (sourceX+sourceWidth > this.network.prop.width) {
    sourceWidth = destWidth = this.network.prop.width - sourceX;
  }

  if (sourceY < 0) {
    sourceHeight = destHeight = this.prop.gridHeight + sourceY;
    destY-= sourceY;
    sourceY = 0;
  }
  else if (sourceY+sourceHeight > this.network.prop.height) {
    sourceHeight = destHeight = this.network.prop.height - sourceY;
  }

  this.ctx.drawImage(this.network.canvas, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
};

/**
 * Convert pixels scroll to time/space data
 */
NetworkView.prototype.computeMinMax = function() {
  this.state.minTime = Math.max(0, Math.floor(-this.state.scrollLeft / this.config.space.h));
  this.state.maxTime = Math.min(this.prop.nbCommits, Math.ceil((-this.state.scrollLeft+this.prop.gridWidth) / this.config.space.h));

  this.state.minSpace = Math.max(0, Math.floor(-this.state.scrollTop / this.config.space.v));
  this.state.maxSpace = Math.min(this.prop.nbLines, Math.ceil((-this.state.scrollTop+this.prop.gridHeight) / this.config.space.v));
};

/**
 * Draw the active commit if any
 */
NetworkView.prototype.drawActiveCommit = function() {
  if (!this.state.activeCommit) {
    if (this.config.tooltip.enabled) this.tooltip.hide();
    return;
  }

  var commit = this.data.commitsById[this.state.activeCommit];
  var pos = this.getCoords([commit.time, commit.space]);
  var color = this.getSpaceColor(commit.space);

  // add bigger point
  this.ctx.fillStyle = color;
  this.ctx.beginPath();
  this.ctx.arc(pos[0], pos[1], this.config.network.pointRadius*2, 0, 2*Math.PI);
  this.ctx.fill();

  // add tooltip
  if (this.config.tooltip.enabled) {
    // needs to be visible to get computed size
    this.tooltip
      .show()
      .css('opacity', 0);

    var posClass = ['bottom','right'];
    var borderPlusPadding = this.tooltip.outerWidth() - this.tooltip.width();

    this.tooltip
      .css('width', Math.min(350, this.prop.width - this.config.tooltip.offset.left) - borderPlusPadding)
      .find('img').attr('src', this.config.tooltip.defaultGravatar).end()
      .find('header').text(commit.date.slice(0, 10)).end()
      .find('h5').text(commit.author).end()
      .find('p').text(commit.message).end();

    // delayed display of avatar
    if (commit.gravatar) {
      var that = this;
      $('<img>').attr('src', commit.gravatar).load(function() {
        that.tooltip.find('img').attr('src', commit.gravatar);
      });
    }

    var style = {
      width: this.tooltip.outerWidth(true),
      height: this.tooltip.outerHeight(true),
      top: pos[1] + this.config.tooltip.offset.top,
      left: pos[0] + this.config.tooltip.offset.left
    };

    // tooltip doesn't fit aside the point, let's center it
    if (style.width + this.config.tooltip.offset.left > this.prop.width/2) {
      style.left = this.prop.width/2 - style.width/2;
      posClass[1] = 'center';
    }
    // not enough space on right, position on left
    else if (style.left + style.width > this.prop.width) {
      style.left = pos[0] - style.width - this.config.tooltip.offset.left;
      posClass[1] = 'left';
    }

    // not enough space on bottom, position on top
    if (style.top + style.height > this.prop.height) {
      style.top = pos[1] - style.height - this.config.tooltip.offset.top;
      posClass[0] = 'top';
    }

    this.tooltip
      .removeClass('top-left top-center top-right bottom-left bottom-center bottom-right')
      .addClass(posClass.join('-'))
      .css({
        left: style.left,
        top: style.top,
        opacity: 1
      });
  }
};

/**
 * Draw main borders
 */
NetworkView.prototype.drawBorders = function() {
  if (!this.config.border.width) {
    return;
  }

  var offset = this.config.border.width/2;

  this.ctx.strokeStyle = this.config.border.color;
  this.ctx.lineWidth = this.config.border.width;

  // main border
  this.ctx.strokeRect(offset, offset, this.prop.width - offset*2, this.prop.height - offset*2);

  // Y axis right border
  if (this.config.yAxis.width) {
    this.ctx.beginPath();
    this.ctx.moveTo(this.config.yAxis.width - offset, 0);
    this.ctx.lineTo(this.config.yAxis.width - offset, this.prop.height);
    this.ctx.stroke();
  }

  // X axis bottom border
  if (this.config.xAxis.height) {
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.config.xAxis.height - offset);
    this.ctx.lineTo(this.prop.width, this.config.xAxis.height - offset);
    this.ctx.stroke();
  }
};

/**
 * Draw title
 */
NetworkView.prototype.drawTitle = function() {
  if (!this.config.xAxis.enabled || !this.config.yAxis.enabled) {
    return;
  }

  // background
  this.ctx.fillStyle = this.config.title.background;
  this.ctx.fillRect(0, 0, this.config.yAxis.width, this.config.xAxis.height);

  // text
  if (this.config.title.enabled) {
    this.ctx.font = this.getFontStyle(this.config.title.font);
    this.ctx.fillStyle = this.config.title.font.color;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    var text = this.getStringEllipsed(this.config.title.text, this.config.yAxis.width, 10);
    this.ctx.fillText(text, this.config.yAxis.width/2, this.config.xAxis.height/2);
  }
};

/**
 * Draw X axis
 */
NetworkView.prototype.drawXAxis = function() {
  if (!this.config.xAxis.enabled) {
    return;
  }

  // extract only visible dates
  var datesToDraw = this.data.meta.dates.slice(this.state.minTime, this.state.maxTime);

  // compute first horizontal position
  var xPos = Math.round((this.state.minTime+0.5) * this.config.space.h + this.state.scrollLeft + this.config.yAxis.width);

  // add background
  this.ctx.fillStyle = this.config.xAxis.background;
  this.ctx.fillRect(this.config.yAxis.width, 0, this.prop.gridWidth, this.config.xAxis.height);

  // add ticks and days
  if (this.config.xAxis.ticks.enabled) {
    this.ctx.strokeStyle = this.config.xAxis.ticks.color;
    this.ctx.lineWidth = this.config.xAxis.ticks.width;
  }

  if (this.config.xAxis.days.enabled) {
    this.ctx.font = this.getFontStyle(this.config.xAxis.font);
    this.ctx.fillStyle = this.config.xAxis.font.color;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
  }

  if (this.config.xAxis.days.enabled || this.config.xAxis.ticks.enabled) {
    var current = ['0000','00','00'];

    datesToDraw.forEach(function(date) {
      if (date != current.join('-')) {
        date = date.split('-');

        if (this.config.xAxis.days.enabled) {
          // draw month (not the first one)
          if (date[1] != current[1] && current[0] != 0) {
            this.ctx.save();
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'top';
            this.ctx.font  = this.getFontStyle($.extend({}, this.config.xAxis.font, {style:'bold'}));

            var text = this.config.lang.shortMonths[date[1]-1] + '\' ' + date[0].slice(-2);
            this.ctx.fillText(text, xPos-5, 5);
            this.ctx.restore();
          }

          // draw day
          this.ctx.fillText(date[2], xPos - this.config.xAxis.font.size*0.1, this.config.xAxis.height-this.config.xAxis.ticks.height);
        }

        // draw ticks
        if (this.config.xAxis.ticks.enabled) {
          var offset = this.config.xAxis.ticks.width/2;

          this.ctx.beginPath();
          this.ctx.moveTo(xPos - offset, this.config.xAxis.height-this.config.xAxis.ticks.height);
          this.ctx.lineTo(xPos - offset, this.config.xAxis.height);
          this.ctx.stroke();
        }

        current = date;
      }

      xPos+= this.config.space.h;
    }, this);
  }
};

/**
 * Draw Y axis
 */
NetworkView.prototype.drawYAxis = function() {
  if (!this.config.yAxis.enabled) {
    return;
  }

  var blocksToDraw = [];

  // extract only visible blocks
  if (this.config.onlyMe) {
    blocksToDraw.push(this.data.meta.blocks[0]);
  }
  else {
    this.data.meta.blocks.some(function(block) {
      // render all blocks at least partly visible
      if (block.start <= this.state.maxSpace || block.end >= this.state.minSpace) {
        blocksToDraw.push(block);
      }

      // stop loop as soon as we reached the end of the viewport
      return block.end >= this.state.maxSpace;
    }, this);
  }

  // compute first vertical position
  var yPos = Math.round(blocksToDraw[0].start * this.config.space.v + this.state.scrollTop + this.config.xAxis.height);

  if (this.config.yAxis.border.width) {
    this.ctx.strokeStyle = this.config.yAxis.border.color;
    this.ctx.lineWidth = this.config.yAxis.border.width;
  }

  if (this.config.yAxis.names.enabled) {
    this.ctx.font = this.getFontStyle(this.config.yAxis.font);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
  }

  blocksToDraw.forEach(function(block) {
    var height = block.count*this.config.space.v;

    // add background
    if (block.name == this.state.activeUser) {
      this.ctx.fillStyle = this.config.yAxis.backgroundActive;
    }
    else {
      this.ctx.fillStyle = this.config.yAxis.background[block.index%2];
    }

    this.ctx.fillRect(0, yPos, this.config.yAxis.width, height);

    // add name
    if (this.config.yAxis.names.enabled) {
      var text = this.getStringEllipsed(block.name, this.config.yAxis.width, 10);

      this.ctx.fillStyle = this.config.yAxis.font.color;
      this.ctx.fillText(text, this.config.yAxis.width/2, yPos+height/2);
    }

    // add bottom border
    if (this.config.yAxis.border.width) {
      var offset = this.config.yAxis.border.width/2;

      this.ctx.beginPath();
      this.ctx.moveTo(0, yPos+height-offset);
      this.ctx.lineTo(this.config.yAxis.width, yPos+height-offset);
      this.ctx.stroke();
    }

    yPos+= height
  }, this);
};

/**
 * Draw grid
 */
NetworkView.prototype.drawGrid = function() {
  if (!this.config.grid.enabled) {
    return;
  }

  var blocksToDraw = [];

  // extract only visible blocks
  if (this.config.onlyMe) {
    blocksToDraw.push(this.data.meta.blocks[0]);
  }
  else {
    this.data.meta.blocks.some(function(block) {
      // render all blocks at least partly visible
      if (block.start <= this.state.maxSpace || block.end >= this.state.minSpace) {
        blocksToDraw.push(block);
      }

      // stop loop as soon as we reached the end of the viewport
      return block.end >= this.state.maxSpace;
    }, this);
  }

  // compute first vertical position
  var yPos = Math.round(blocksToDraw[0].start * this.config.space.v + this.state.scrollTop + this.config.xAxis.height);

  if (this.config.grid.border.width) {
    this.ctx.strokeStyle = this.config.grid.border.color;
    this.ctx.lineWidth = this.config.grid.border.width;
  }

  blocksToDraw.forEach(function(block) {
    var height = block.count*this.config.space.v;

    // add background
    if (block.name == this.state.activeUser) {
      this.ctx.fillStyle = this.config.yAxis.backgroundActive;
    }
    else {
      this.ctx.fillStyle = this.config.yAxis.background[block.index%2];
    }

    this.ctx.fillRect(this.config.yAxis.width, yPos, this.prop.gridWidth, height);

    // add bottom border
    if (this.config.grid.border.width) {
      var offset = this.config.grid.border.width/2;

      this.ctx.beginPath();
      this.ctx.moveTo(this.config.yAxis.width, yPos+height-offset);
      this.ctx.lineTo(this.prop.width, yPos+height-offset);
      this.ctx.stroke();
    }

    yPos+= height
  }, this);
};

/**
 * Mouse down event
 * Set dragging flag
 */
NetworkView.prototype.mouseDown = function() {
  this.state.dragging = true;
};

/**
 * Mouse move event
 * Handles drag navigation & mouse hovers
 */
NetworkView.prototype.mouseMove = function(e) {
  var redraw = false;

  if (this.state.dragging) {
    this.state.scrollTop =  Math.min(this.prop.maxScroll.t, Math.max(this.prop.maxScroll.b, this.state.scrollTop + e.pageY - this.state.mouseY));
    this.state.scrollLeft = Math.min(this.prop.maxScroll.l, Math.max(this.prop.maxScroll.r, this.state.scrollLeft + e.pageX - this.state.mouseX));

    this.state.activeCommit = null;
    this.state.activeUser = null;

    this.canvas.style.cursor = 'move';

    redraw = true;
  }
  else {
    var hoveredCommit = this.hoveredCommit(e);
    if (this.state.activeCommit != hoveredCommit) {
      this.state.activeCommit = hoveredCommit;

      this.canvas.style.cursor = !!hoveredCommit ? 'pointer' : 'move';

      redraw = true;
    }
    else {
      var hoveredUser = this.hoveredUser(e);
      if (this.state.activeUser != hoveredUser) {
        this.state.activeUser = hoveredUser;

        this.canvas.style.cursor = !!hoveredUser ? 'pointer' : 'move';

        redraw = true;
      }
    }
  }

  if (redraw) {
    requestAnimationFrame(this.drawAll.bind(this));
  }

  this.state.mouseX = e.pageX;
  this.state.mouseY = e.pageY;
};

/**
 * Mouse up event
 * Open page to commit or fork & remove dragging flag
 */
NetworkView.prototype.mouseUp = function() {
  var redraw = false;

  if (this.state.activeCommit) {
    var commit = this.data.commitsById[this.state.activeCommit];
    var user = this.userBySpace(commit.space);
    var url = 'https://github.com/' + user.name + '/' + user.repo + '/commit/' + commit.id;

    window.open(url);

    this.state.activeCommit = null;
    redraw = true;
  }
  else if (this.state.activeUser) {
    var user = this.data.usersById[this.state.activeUser];
    var url = 'https://github.com/' + user.name + '/' + user.repo;

    window.open(url);

    this.state.activeUser = null;
    redraw = true;
  }

  if (redraw) {
    this.drawAll();
  }

  this.state.dragging = false;
};

/**
 * Get hovered commit if any
 */
NetworkView.prototype.hoveredCommit = function(e) {
  var mousePos = [
    e.pageX - this.prop.left,
    e.pageY - this.prop.top
  ];

  var r2 = this.config.network.pointRadius*2;
  var result;

  this.data.commits.slice(this.state.minTime, this.state.maxTime).some(function(commit) {
    if (commit.space >= this.state.minSpace && commit.space <= this.state.maxSpace) {
      var commitPos = this.getCoords([commit.time, commit.space]);

      if (commitPos[0] >= mousePos[0]-r2 && commitPos[0] <= mousePos[0]+r2 &&
        commitPos[1] >= mousePos[1]-r2 && commitPos[1] <= mousePos[1]+r2) {

        result = commit.id;
        return true;
      }
    }
  }, this);

  return result;
};

/**
 * Get hovered user if any
 */
NetworkView.prototype.hoveredUser = function(e) {
  var mousePos = [
    e.pageX - this.prop.left,
    e.pageY - this.prop.top - this.config.xAxis.height - this.state.scrollTop
  ];

  var result;

  if (mousePos[0] > this.config.yAxis.width) {
    return result;
  }

  this.data.meta.blocks.some(function(block) {
    if (block.end >= this.state.minSpace) {
      var y1 = block.start * this.config.space.v,
          y2 = (block.end+1) * this.config.space.v;

      if (mousePos[1] >= y1 && mousePos[1] <= y2) {
        result = block.name;
        return true;
      }
    }

    return block.end >= this.state.maxSpace;
  }, this);

  return result;
};

/**
 * Find user by space coords
 */
NetworkView.prototype.userBySpace = function(space) {
  var result;

  this.data.meta.blocks.some(function(block) {
    if (space >= block.start && space <= block.end) {
      result = this.data.usersById[block.name];
      return true;
    }
  }, this);

  return result;
};

/**
 * Utility to limit a text to a certain width
 */
NetworkView.prototype.getStringEllipsed = function(str, maxWidth, padding) {
  padding = padding || 0;

  var width = this.ctx.measureText(str).width;

  if (width <= maxWidth) {
    return str;
  }

  var ellipseWidth = this.ctx.measureText('…').width;

  do {
    str = str.slice(0, -1);
    width = this.ctx.measureText(str).width;
  }
  while (width+ellipseWidth > maxWidth+padding && str.length > 1);

  return str + '…';
};

/**
 * Utility to get canvas font property
 */
NetworkView.prototype.getFontStyle = function(font) {
  return Network.prototype.getFontStyle.call(this, font);
};

/**
 * Get color for particular space
 */
NetworkView.prototype.getSpaceColor = function(space) {
  return Network.prototype.getSpaceColor.call(this, space);
};

/**
 * Translate "git" coords (space, time) to pixels
 */
NetworkView.prototype.getCoords = function(c) {
  var tmp = Network.prototype.getCoords.call(this, c);
  return [
    tmp[0] + this.config.yAxis.width + this.state.scrollLeft,
    tmp[1] + this.config.xAxis.height + this.state.scrollTop
  ];
};