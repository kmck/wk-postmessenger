const json = require('rollup-plugin-json');
const babel = require('rollup-plugin-babel');
const nodeResolve = require('rollup-plugin-node-resolve');
const istanbul = require('rollup-plugin-istanbul');

module.exports = (config) => {
  config.set({
    basePath: '',
    frameworks: ['mocha', 'chai', 'sinon'],
    files: [
      'node_modules/babel-polyfill/dist/polyfill.js',
      'test/**/*.test.js',
    ],
    exclude: [],

    preprocessors: {
      'test/**/*.js': ['rollup'],
    },
    rollupPreprocessor: {
      plugins: [
        json(),
        babel(),
        nodeResolve({ jsnext: true }),
        istanbul({
          include: 'src/WKPostMessenger.js',
          instrumenterConfig: {
            embedSource: true,
          },
        }),
      ],
      // will help to prevent conflicts between different tests entries
      sourceMap: 'inline',
    },

    reporters: ['mocha', 'coverage'],
    coverageReporter: {
      dir: 'coverage',
      reporters: [{
        type: 'lcov',
        subdir: '.',
      }, {
        type: 'json',
        subdir: '.',
        file: 'coverage-final.json',
      }, {
        type: 'text',
      }],
    },

    plugins: [
      'karma-phantomjs-launcher',
      'karma-rollup-plugin',
      'karma-mocha',
      'karma-mocha-reporter',
      'karma-chai',
      'karma-sinon',
      'karma-coverage',
    ],

    port: 9876,
    colors: true,
    captureConsole: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    browsers: ['PhantomJS'],
    singleRun: true,
    concurrency: Infinity,
  });
};
