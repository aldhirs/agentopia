import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['out/**', 'release/**', 'node_modules/**', 'spike/out/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Layout of templates is a style choice; keep lint focused on correctness.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off',
      'vue/require-default-prop': 'off',
      // Page components (Lobby) are single-word by design.
      'vue/multi-word-component-names': ['error', { ignores: ['Lobby'] }],
    },
  },
  {
    files: ['scripts/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
