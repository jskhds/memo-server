module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  rules: {
    // 禁止使用 any
    '@typescript-eslint/no-explicit-any': 'error',
    // 禁止未使用变量
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // 要求显式返回类型
    '@typescript-eslint/explicit-function-return-type': 'off',
    // prettier 格式检查
    'prettier/prettier': 'error',
    // 禁止 console（使用 logger）
    'no-console': 'warn',
  },
  env: {
    node: true,
    es2020: true,
  },
};
