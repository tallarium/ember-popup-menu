import Ember from "ember";

var keys = Ember.keys;
var copy = Ember.copy;
var get = Ember.get;
var set = Ember.set;

var fmt = Ember.String.fmt;
var w = Ember.String.w;

var bind = Ember.run.bind;

var isSimpleClick = Ember.ViewUtils.isSimpleClick;
var $ = Ember.$;

var guard = function (fn) {
  return function (evt) {
    if (get(this, 'component.disabled')) { return; }
    fn.call(this, evt);
  };
};

var getElementForTarget = function (target) {
  if (Ember.View.detectInstance(target)) {
    return get(target, 'element');
  } else if (typeof target === "string") {
    return document.getElementById(target);
  } else {
    return target;
  }
};

var getLabelSelector = function ($element) {
  var id = $element.attr('id');
  if (id) {
    return fmt("label[for='%@']", [id]);
  }
};

var getNearestViewForElement = function (element) {
  var $target = $(element);
  if (!$target.hasClass('ember-view')) {
    $target = $target.parents('ember-view');
  }
  return Ember.View.views[$target.attr('id')];
};

var labelForEvent = function (evt) {
  var $target = $(evt.target);
  if ($target[0].tagName.toLowerCase() === 'label') {
    return $target;
  } else {
    return $target.parents('label');
  }
};

var isLabelClicked = function (target, label) {
  if (label == null) {
    return false;
  }
  return $(label).attr('for') === $(target).attr('id');
};

var VALID_ACTIVATORS = ["focus", "hover", "click", "hold"];
var parseActivators = function (value) {
  if (value) {
    var activators = value;
    if (typeof value === "string") {
      activators = w(value);
    }
    Ember.assert(
      fmt("%@ are not valid activators.\n" +
          "Valid activators are %@", [value, VALID_ACTIVATORS.join(', ')]),
      copy(activators).removeObjects(VALID_ACTIVATORS).length === 0
    );
    return activators;
  }

  Ember.assert(
    fmt("You must provide an event name to the {{popup-menu}}.\n" +
        "Valid events are %@", [VALID_ACTIVATORS.join(', ')]),
    false
  );
};


var Target = Ember.Object.extend({

  init: function () {
    Ember.assert("You cannot make the {{popup-menu}} a target of itself.", get(this, 'component') !== get(this, 'target'));

    this.eventManager = {
      focusin:    bind(this, 'focus'),
      focusout:   bind(this, 'blur'),
      mouseenter: bind(this, 'mouseEnter'),
      mouseleave: bind(this, 'mouseLeave'),
      mousedown:  bind(this, 'mouseDown')
    };
  },

  attach: function () {
    var element = getElementForTarget(this.target);
    var $element = $(element);
    var $document = $(document);

    // Trap the element
    this.element = element;

    var eventManager = this.eventManager;

    keys(eventManager).forEach(function (event) {
      $element.on(event, eventManager[event]);
    });

    var selector = getLabelSelector($element);
    if (selector) {
      keys(eventManager).forEach(function (event) {
        $document.on(event, selector, eventManager[event]);
      });
    }
  },

  detach: function () {
    var element = this.element;
    var $element = $(element);
    var $document = $(document);

    var eventManager = this.eventManager;

    keys(eventManager).forEach(function (event) {
      $element.off(event, eventManager[event]);
    });

    var selector = getLabelSelector($element);
    if (selector) {
      keys(eventManager).forEach(function (event) {
        $document.off(event, selector, eventManager[event]);
      });
    }

    // Remove references for GC
    this.element = null;
    this.target = null;
    this.eventManager = null;
    this.component = null;
  },

  on: function (key, value) {
    return parseActivators(value);
  }.property(),

  isClicked: function (evt) {
    if (isSimpleClick(evt)) {
      var label = labelForEvent(evt);
      var element = this.element;
      return evt.target === element || $.contains(element, evt.target) ||
        isLabelClicked(element, label);
    }
    return false;
  },

  isActive: function () {
    var activators = get(this, 'on');
    var isActive = false;

    if (activators.contains('focus')) {
      isActive = isActive || get(this, 'focused');
    }

    if (activators.contains('hover')) {
      isActive = isActive || get(this, 'hovered');
      if (activators.contains('hold')) {
        isActive = isActive || get(this, 'component.hovered');
      }
    }

    if (activators.contains('click') || activators.contains('hold')) {
      isActive = isActive || get(this, 'active');
    }

    return !!isActive;
  }.property('focused', 'hovered', 'active', 'component.hovered'),

  focus: guard(function () {
    set(this, 'focused', true);
  }),

  blur: guard(function () {
    set(this, 'focused', false);
  }),

  mouseEnter: guard(function () {
    set(this, 'hovered', true);
  }),

  mouseLeave: guard(function () {
    set(this, 'hovered', false);
  }),

  mouseDown: guard(function (evt) {
    if (!this.isClicked(evt)) {
      return false;
    }

    var element = this.element;
    var isActive = !get(this, 'isActive');
    set(this, 'active', isActive);

    if (isActive) {
      this.holdStart = new Date().getTime();

      var eventManager = this.eventManager;
      eventManager.mouseup = bind(this, 'mouseUp');
      $(document).on('mouseup', eventManager.mouseup);

      evt.preventDefault();
    }

    $(element).focus();
    return true;
  }),

  mouseUp: function (evt) {
    // Remove mouseup event
    var eventManager = this.eventManager;
    $(document).off('mouseup', eventManager.mouseup);
    eventManager.mouseup = null;

    var label = labelForEvent(evt);

    // Treat clicks on <label> elements as triggers to
    // open the menu
    if (isLabelClicked(this.element, label)) {
      return true;
    }

    var view = getNearestViewForElement(evt.target);
    var activators = get(this, 'on');

    // Manually trigger a click on internal elements
    if (view && view.nearestOfType(get(this, 'component').constructor)) {
      view.trigger('click');

    } else if (activators.contains('click') && activators.contains('hold')) {
      // If the user waits more than 400ms between mouseDown and mouseUp,
      // we can assume that they are clicking and dragging to the menu item,
      // and we should close the menu if they mouseup anywhere not inside
      // the menu.
      if (new Date().getTime() - this.holdStart > 400) {
        set(this, 'active', false);
      }
    }
    return true;
  }

});

export default Target;
