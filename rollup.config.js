import json from 'rollup-plugin-json';
import babel from 'rollup-plugin-babel';
import nodeResolve from 'rollup-plugin-node-resolve';

export default {
  entry: 'src/WKPostMessenger.js',
  format: 'cjs',
  plugins: [
    json(),
    babel(),
    nodeResolve({ jsnext: true }),
  ],
  dest: 'dist/WKPostMessenger.js',
};
