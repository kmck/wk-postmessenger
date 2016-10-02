module.exports = {
  extends: '../.eslintrc.js',
  env: {
    browser: true,
    mocha: true,
  },
  globals: {
    assert: true,
    sinon: true,
  },
  rules: {
    'no-new': 'off',
  },
};
