module.exports = {
  env: { node: true, browser: true },
  globals: { HTMLRewriter: 'readonly' },
  rules: {
    'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'],
    'no-await-in-loop': 'off',
    'no-console': 'off',
  },
  overrides: [{
    files: ['test/*.mjs'],
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true }] },
  }],
};
