#!/usr/bin/env node
'use strict';

const path = require('path');
const http = require('http');
const connect = require('connect');
const KarmaServer = require('karma').Server;
const serveStatic = require('serve-static');
const argv = require('yargs').argv;
const rollup = require('rollup');
const config = require('../rollup.config');

const isCI = process.env.CI === 'true';

const serveChildViews = () => {
  // We'll run the child iframe on a different port from karma to
  // to properly test cross-domain iframe communication
  const childViewsApp = connect()
    .use(serveStatic('dist'))
    .use(serveStatic('test/childFixtures'));

  http.createServer(childViewsApp).listen(9000);
  // Host the child views on two ports so tests can do interesting
  // things like redirect the iframe between two origins.
  http.createServer(childViewsApp).listen(9001);
};

const runTests = () => {
  const karmaConfig = {
    configFile: path.resolve(__dirname, '../karma.conf.js'),
    singleRun: !argv.watch,
    // logLevel: 'debug'
  };

  if (isCI) {
    karmaConfig.browsers = ['ChromeHeadless'];
    // Add any other CI-specific configurations here
  }

  new KarmaServer(karmaConfig).start();
};

const build = () => {
  const watcher = rollup.watch(config);

  let testsRunning = false;

  watcher.on('event', (event) => {
    // Wait until the first bundle is created before
    // running tests.
    switch (event.code) {
      case 'END':
        if (!testsRunning) {
          runTests();
          testsRunning = true;
        }

        if (!argv.watch) {
          watcher.close();
        }
        break;
      case 'ERROR':
      case 'FATAL':
        console.error(event.error);
        break;
    }
  });
};

if (isCI) {
  // For CI, we might want to skip serving child views and just run tests
  runTests();
} else {
  serveChildViews();
  build();
}
