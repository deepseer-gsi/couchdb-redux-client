// ImagesLoaded library, slightly modified from
// https://github.com/desandro/imagesloaded/blob/master/imagesloaded.js
// -------------------------- helpers -------------------------- //
/* eslint-disable */

// extend objects
const extend = (a, b) => {
  for (let prop in b) {
    a[prop] = b[prop];
  }
  return a;
};

// turn element or nodeList into an array
const makeArray = (obj) => {
  let ary = [];
  if (Array.isArray(obj)) {
    // use object if already an array
    ary = obj;
  } else if (typeof obj.length == 'number') {
    // convert nodeList to array
    for (let i = 0; i < obj.length; i++) {
      ary.push(obj[i]);
    }
  } else {
    // array of single index
    ary.push(obj);
  }
  return ary;
};

//const factory = (window, EvEmitter) => {
// -------------------------- imagesLoaded -------------------------- //

/**
 * @param {Array, Element, NodeList, String} elem
 * @param {Object or Function} options - if function, use as callback
 * @param {Function} onAlways - callback function
 */
function ImagesLoaded(EvEmitter, elem, options, onAlways) {
  // coerce ImagesLoaded() without new, to be new ImagesLoaded()
  //if (!( this instanceof ImagesLoaded )) {
  //  return new ImagesLoaded(elem, options, onAlways);
  //}

  this.EvEmitter = EvEmitter;
  this.on = EvEmitter.on;
  this.off = EvEmitter.off;
  this.once = EvEmitter.once;
  this.emitEvent = EvEmitter.emitEvent;

  // use elem as selector string
  if (typeof elem == 'string') {
    elem = document.querySelectorAll(elem);
  }

  this.elements = makeArray(elem);
  this.options = extend({}, this.options);

  if (typeof options == 'function') {
    onAlways = options;
  } else {
    extend(this.options, options);
  }

  if (onAlways) {
    this.on('always', onAlways);
  }

  this.getImages();

  // HACK check async to allow time to bind listeners
  setTimeout(function () {
    this.check();
  }.bind(this));
}

// ImagesLoaded.prototype = Object.create(EvEmitter.prototype);

ImagesLoaded.prototype.options = {};

ImagesLoaded.prototype.getImages = function () {
  this.images = [];

  // filter & find items if we have an item selector
  this.elements.forEach(this.addElementImages, this);
};

/**
 * @param {Node} element
 */
ImagesLoaded.prototype.addElementImages = function (elem) {
  // filter siblings
  if (elem.nodeName == 'IMG') {
    this.addImage(elem);
  }
  // get background image on element
  if (this.options.background === true) {
    this.addElementBackgroundImages(elem);
  }

  // find children
  // no non-element nodes, #143
  var nodeType = elem.nodeType;
  if (!nodeType || !elementNodeTypes[nodeType]) {
    return;
  }
  var childImgs = elem.querySelectorAll('img');
  // concat childElems to filterFound array
  for (var i = 0; i < childImgs.length; i++) {
    var img = childImgs[i];
    this.addImage(img);
  }

  // get child background images
  if (typeof this.options.background == 'string') {
    var children = elem.querySelectorAll(this.options.background);
    for (i = 0; i < children.length; i++) {
      var child = children[i];
      this.addElementBackgroundImages(child);
    }
  }
};

var elementNodeTypes = {
  1: true,
  9: true,
  11: true
};

ImagesLoaded.prototype.addElementBackgroundImages = function (elem) {
  var style = getComputedStyle(elem);
  if (!style) {
    // Firefox returns null if in a hidden iframe https://bugzil.la/548397
    return;
  }
  // get url inside url("...")
  var reURL = /url\((['"])?(.*?)\1\)/gi;
  var matches = reURL.exec(style.backgroundImage);
  while (matches !== null) {
    var url = matches && matches[2];
    if (url) {
      this.addBackground(url, elem);
    }
    matches = reURL.exec(style.backgroundImage);
  }
};

/**
 * @param {Image} img
 */
ImagesLoaded.prototype.addImage = function (img) {
  var loadingImage = new LoadingImage(this.EvEmitter, img);
  this.images.push(loadingImage);
};

ImagesLoaded.prototype.addBackground = function (url, elem) {
  var background = new Background(url, elem);
  this.images.push(background);
};

ImagesLoaded.prototype.check = function () {
  var _this = this;
  this.progressedCount = 0;
  this.hasAnyBroken = false;
  // complete if no images
  if (!this.images.length) {
    this.complete();
    return;
  }

  function onProgress(image, elem, message) {
    // HACK - Chrome triggers event before object properties have changed. #83
    setTimeout(function () {
      _this.progress(image, elem, message);
    });
  }

  this.images.forEach(function (loadingImage) {
    loadingImage.once('progress', onProgress);
    loadingImage.check();
  });
};

ImagesLoaded.prototype.progress = function (image, elem, message) {
  this.progressedCount++;
  this.hasAnyBroken = this.hasAnyBroken || !image.isLoaded;
  // progress event
  this.emitEvent('progress', [this, image, elem]);
  if (this.jqDeferred && this.jqDeferred.notify) {
    this.jqDeferred.notify(this, image);
  }
  // check if completed
  if (this.progressedCount == this.images.length) {
    this.complete();
  }

  if (this.options.debug && console) {
    console.log('progress: ' + message, image, elem);
  }
};

ImagesLoaded.prototype.complete = function () {
  var eventName = this.hasAnyBroken ? 'fail' : 'done';
  this.isComplete = true;
  this.emitEvent(eventName, [this]);
  this.emitEvent('always', [this]);
  if (this.jqDeferred) {
    var jqMethod = this.hasAnyBroken ? 'reject' : 'resolve';
    this.jqDeferred[jqMethod](this);
  }
};

// --------------------------  -------------------------- //

function LoadingImage(EvEmitter, img) {

  this.on = EvEmitter.on;
  this.off = EvEmitter.off;
  this.once = EvEmitter.once;
  this.emitEvent = EvEmitter.emitEvent;

  this.img = img;
}

// LoadingImage.prototype = Object.create(EvEmitter.prototype);

LoadingImage.prototype.check = function () {
  // If complete is true and browser supports natural sizes,
  // try to check for image status manually.
  var isComplete = this.getIsImageComplete();
  if (isComplete) {
    // report based on naturalWidth
    this.confirm(this.img.naturalWidth !== 0, 'naturalWidth');
    return;
  }

  // If none of the checks above matched, simulate loading on detached element.
  this.proxyImage = new Image();
  this.proxyImage.addEventListener('load', this);
  this.proxyImage.addEventListener('error', this);
  // bind to image as well for Firefox. #191
  this.img.addEventListener('load', this);
  this.img.addEventListener('error', this);
  this.proxyImage.src = this.img.src;
};

LoadingImage.prototype.getIsImageComplete = function () {
  return this.img.complete && this.img.naturalWidth !== undefined;
};

LoadingImage.prototype.confirm = function (isLoaded, message) {
  this.isLoaded = isLoaded;
  this.emitEvent('progress', [this, this.img, message]);
};

// ----- events ----- //

// trigger specified handler for event type
LoadingImage.prototype.handleEvent = function (event) {
  var method = 'on' + event.type;
  if (this[method]) {
    this[method](event);
  }
};

LoadingImage.prototype.onload = function () {
  this.confirm(true, 'onload');
  this.unbindEvents();
};

LoadingImage.prototype.onerror = function () {
  this.confirm(false, 'onerror');
  this.unbindEvents();
};

LoadingImage.prototype.unbindEvents = function () {
  this.proxyImage.removeEventListener('load', this);
  this.proxyImage.removeEventListener('error', this);
  this.img.removeEventListener('load', this);
  this.img.removeEventListener('error', this);
};

// -------------------------- Background -------------------------- //

function Background(url, element) {
  this.url = url;
  this.element = element;
  this.img = new Image();
}

// inherit LoadingImage prototype
Background.prototype = Object.create(LoadingImage.prototype);

Background.prototype.check = function () {
  this.img.addEventListener('load', this);
  this.img.addEventListener('error', this);
  this.img.src = this.url;
  // check if image is already complete
  var isComplete = this.getIsImageComplete();
  if (isComplete) {
    this.confirm(this.img.naturalWidth !== 0, 'naturalWidth');
    this.unbindEvents();
  }
};

Background.prototype.unbindEvents = function () {
  this.img.removeEventListener('load', this);
  this.img.removeEventListener('error', this);
};

Background.prototype.confirm = function (isLoaded, message) {
  this.isLoaded = isLoaded;
  this.emitEvent('progress', [this, this.element, message]);
};

// export default factory(window, EvEmitter);

export default ImagesLoaded;
