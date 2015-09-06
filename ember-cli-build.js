/* global require, module */

var EmberAddon = require('ember-cli/lib/broccoli/ember-addon');

module.exports = function(defaults) {

  var app = new EmberAddon(defaults);

  app.import('bower_components/dom-ruler/dist/dom-ruler.amd.js', {
    exports: {
      'dom-ruler': ['default']
    }
  });

  return app.toTree();
}
