'use strict';

const configureFCLogging = require('./lib/configure');

module.exports = class {
  constructor(app) {
    this.app = app;
  }

  // Run as early as possible so that any app.logger.* call from other
  // plugins' configDidLoad / didLoad hooks already emits JSON to stdout.
  configDidLoad() {
    configureFCLogging(this.app);
  }
};
