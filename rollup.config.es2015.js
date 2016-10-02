import json from 'rollup-plugin-json';
import babel from 'rollup-plugin-babel';
import nodeResolve from 'rollup-plugin-node-resolve';

export default {
  entry: 'src/WKPostMessenger.js',
  format: 'es',
  plugins: [
    json(),
    babel(),
    nodeResolve({ jsnext: true }),
  ],
  dest: 'dist/WKPostMessenger.es2015.js',
};
