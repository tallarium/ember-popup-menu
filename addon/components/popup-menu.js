import Ember from "ember";
import Target from "../system/target";
import Rectangle from "../system/rectangle";

var bind = Ember.run.bind;
var scheduleOnce = Ember.run.scheduleOnce;
var next = Ember.run.next;
var get = Ember.get;
var set = Ember.set;
var fmt = Ember.String.fmt;
var w = Ember.String.w;

var filterBy = Ember.computed.filterBy;
var alias = Ember.computed.alias;

var addObserver = Ember.addObserver;
var removeObserver = Ember.removeObserver;

var RSVP = Ember.RSVP;

var isSimpleClick = Ember.ViewUtils.isSimpleClick;
var $ = Ember.$;

var PopupMenuComponent = Ember.Component.extend({

  isVisible: false,

  classNames: ['popup-menu'],

  classNameBindings: ['orientationClassName', 'pointerClassName'],

  orientationClassName: function () {
    var orientation = get(this, 'orientation');
    return orientation ? fmt('orient-%@', [orientation]) : null;
  }.property('orientation'),

  pointerClassName: function () {
    var pointer = get(this, 'pointer');
    return pointer ? fmt('pointer-%@', [pointer]) : null;
  }.property('pointer'),

  disabled: false,

  orientation: null,

  pointer: null,

  flow: 'around',

  /**
    The target element of the popup menu.
    Can be a view, id, or element.
   */
  for: null,

  on: null,

  addTarget: function (target, options) {
    get(this, 'targets').pushObject(Target.create({
      component: this,
      target: target,
      on: options.on
    }));
  },

  targets: function () {
    return [];
  }.property(),

  /**
    Property that notifies the popup menu to retile
   */
  'will-change': alias('willChange'),
  willChange: function (key, value) {
    if (value) {
      var observers = value;
      if (typeof value === "string") {
        observers = w(value);
      }
      return observers;
    }
    return [];
  }.property(),

  willChangeWillChange: function () {
    get(this, 'willChange').forEach(function (key) {
      removeObserver(this, key, this, 'retile');
    }, this);
  }.observesBefore('willChange'),

  willChangeDidChange: function () {
    get(this, 'willChange').forEach(function (key) {
      addObserver(this, key, this, 'retile');
    }, this);
    this.retile();
  }.observes('willChange').on('init'),

  // ..............................................
  // Event management
  //

  attachWindowEvents: function () {
    this.retile();

    var retile = this.__retile = bind(this, 'retile');
    ['scroll', 'resize'].forEach(function (event) {
      $(window).on(event, retile);
    });

    addObserver(this, 'isVisible', this, 'retile');
  }.on('didInsertElement'),

  attachTargets: function () {
    // Add implicit target
    if (get(this, 'for') && get(this, 'on')) {
      this.addTarget(get(this, 'for'), {
        on: get(this, 'on')
      });
    }

    next(this, function () {
      get(this, 'targets').invoke('attach');
    });
  }.on('didInsertElement'),

  removeEvents: function () {
    get(this, 'targets').invoke('detach');
    set(this, 'targets', []);

    var retile = this.__retile;
    ['scroll', 'resize'].forEach(function (event) {
      $(window).off(event, retile);
    });

    if (this.__documentClick) {
      $(document).off('mousedown', this.__documentClick);
      this.__documentClick = null;
    }

    removeObserver(this, 'isVisible', this, 'retile');
    this.__retile = null;
  }.on('willDestroyElement'),

  mouseEnter: function () {
    if (get(this, 'disabled')) { return; }
    set(this, 'hovered', true);
  },

  mouseLeave: function () {
    if (get(this, 'disabled')) { return; }
    set(this, 'hovered', false);
    get(this, 'targets').setEach('hovered', false);
  },

  documentClick: function (evt) {
    if (get(this, 'disabled')) { return; }

    var targets = get(this, 'targets');
    var element = get(this, 'element');
    var clicked = isSimpleClick(evt) &&
      (evt.target === element || $.contains(element, evt.target));
    var clickedAnyTarget = targets.any(function (target) {
      return target.isClicked(evt);
    });

    if (!clicked && !clickedAnyTarget) {
      targets.setEach('active', false);
    }
  },

  activeTargets: filterBy('targets', 'isActive', true),

  isActive: function () {
    var activeTargets = get(this, 'activeTargets');

    // Bug in filterBy causing false negatives
    if (activeTargets.length === 0) {
      activeTargets = get(this, 'targets').filterBy('isActive', true);
    }

    if (activeTargets.length > 1) {
      Ember.Logger.warn("More than one target was activated for a {{popup-menu}}.\n" +
                        "Using the first active target.");
    }
    return get(activeTargets, 'length') > 0;
  }.property('activeTargets.length'),

  /**
    Before the menu is shown, setup click events
    to catch when the user clicks outside the
    menu.
   */
  visibilityDidChange: function () {
    if (this.__animating) { return; }

    var proxy = this.__documentClick = this.__documentClick || bind(this, 'documentClick');
    var animation = get(this, 'animation');
    var component = this;

    var isActive = get(this, 'isActive');
    var isInactive = !isActive;
    var isVisible = get(this, 'isVisible');
    var isHidden = !isVisible;

    if (isActive && isHidden) {
      this.__animating = true;
      this.show(animation).then(function () {
        $(document).on('mousedown', proxy);
        component.__animating = false;
      });

    // Remove click events immediately
    } else if (isInactive && isVisible) {
      this.__animating = true;
      $(document).off('mousedown', proxy);
      this.hide(animation).then(function () {
        component.__animating = false;
      });
    }
  }.observes('isActive').on('init'),

  hide: function (animationName) {
    var deferred = RSVP.defer();
    var component = this;
    var animation = this.container.lookup('popup-animation:' + animationName);
    next(this, function () {
      if (animation) {
        var promise = animation.out.call(this);
        promise.then(function () {
          set(component, 'isVisible', false);
        });
        deferred.resolve(promise);
      } else {
        set(component, 'isVisible', false);
        deferred.resolve();
      }
    });
    return deferred.promise;
  },

  show: function (animationName) {
    var deferred = RSVP.defer();
    var animation = this.container.lookup('popup-animation:' + animationName);
    set(this, 'isVisible', true);
    scheduleOnce('afterRender', this, function () {
      if (animation) {
        deferred.resolve(animation['in'].call(this));
      } else {
        deferred.resolve();
      }
    });
    return deferred.promise;
  },

  retile: function () {
    if (get(this, 'isVisible')) {
      scheduleOnce('afterRender', this, 'tile');
    }
  },

  tile: function () {
    var target = get(this, 'activeTargets.firstObject');
    // Don't tile if there's nothing to constrain the popup menu around
    if (!get(this, 'element') || !target && get(this, 'isActive')) {
      return;
    }

    var $popup = this.$();
    var $pointer = $popup.children('.popup-menu_pointer');

    var boundingRect = Rectangle.ofElement(window);
    var popupRect = Rectangle.ofView(this, 'padding');
    var targetRect = Rectangle.ofElement(target.element, 'padding');
    var pointerRect = Rectangle.ofElement($pointer[0], 'borders');

    if (boundingRect.intersects(targetRect)) {
      var flowName = get(this, 'flow');
      var constraints = this.container.lookup('popup-constraint:' + flowName);
      Ember.assert(fmt(
        ("The flow named '%@1' was not registered with the {{popup-menu}}.\n" +
         "Register your flow by creating a file at 'app/popup-menu/flows/%@1.js' with the following function body:\n\nexport default function %@1 () {\n  return this.orientBelow().andSnapTo(this.center);\n});"), [flowName]), constraints);
      var solution;
      for (var i = 0, len = constraints.length; i < len; i++) {
        solution = constraints[i].solveFor(boundingRect, targetRect, popupRect, pointerRect);
        if (solution.valid) { break; }
      }

      this.setProperties({
        orientation: solution.orientation,
        pointer:     solution.pointer
      });

      var offset = $popup.offsetParent().offset();
      var top = popupRect.top - offset.top;
      var left = popupRect.left - offset.left;
      $popup.css({
        top: top + 'px',
        left: left + 'px'
      });
      $pointer.css({
        top: pointerRect.top + 'px',
        left: pointerRect.left + 'px'
      });
    }
  }

});

export default PopupMenuComponent;
