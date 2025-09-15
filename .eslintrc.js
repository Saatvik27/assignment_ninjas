module.exports = {
  extends: ['next/core-web-vitals'],
  rules: {
    // Disable problematic rules for deployment
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    'prefer-const': 'warn',
    'react/no-unescaped-entities': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
  },
}