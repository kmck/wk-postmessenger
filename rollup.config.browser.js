import json from 'rollup-plugin-json';
import babel from 'rollup-plugin-babel';
import nodeResolve from 'rollup-plugin-node-resolve';
import uglify from 'rollup-plugin-uglify';

export default {
  entry: 'src/WKPostMessenger.js',
  moduleName: 'WKPostMessenger',
  format: 'umd',
  globals: {
    'tiny-emitter': 'Emitter',
  },
  plugins: [
    json(),
    babel(),
    nodeResolve({ jsnext: true }),
    uglify(),
  ],
  dest: 'browser/WKPostMessenger.min.js',
};
