import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    files: ["src/**/*.{ts,js}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        process: "readonly",
        __dirname: "readonly",
        console: "readonly",
        Buffer: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^(next|req|res)$', // ignore common Express args
          varsIgnorePattern: '^(next|req|res)$',
        },
      ],
        "no-console": ["error", { allow: ["error","info"] }],
        
      "@typescript-eslint/no-explicit-any": "off",

       "@typescript-eslint/no-namespace": ["error", { "allowDeclarations": true }],

        "no-undef": "off"
    },
  },
  prettier,
];
