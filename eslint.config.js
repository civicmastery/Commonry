import js from "@eslint/js";
import typescript from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default typescript.config(
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // React Rules
      "react/react-in-jsx-scope": "off", // Not needed in React 17+
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Security Rules
      "react/no-danger": "warn", // Warn when using dangerouslySetInnerHTML - requires skipcq comment explaining sanitization

      // Performance Rules
      "react/jsx-no-bind": [
        "warn",
        {
          allowArrowFunctions: false,
          allowBind: false,
          ignoreRefs: true,
        },
      ], // Warn about creating functions in JSX - use useCallback or data attributes instead

      // TypeScript Rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",

      // General Rules
      // TS itself reports undefined identifiers; no-undef is redundant for
      // .ts/.tsx and false-positives on DOM/node globals (typescript-eslint FAQ).
      "no-undef": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "warn",
      "no-var": "error",
    },
  },
  {
    // Root-level Node.js server/scripts (CommonJS/ESM run under Node)
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        require: "readonly",
        module: "writable",
        exports: "writable",
        global: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "build/**",
      "*.config.js",
      ".eslintrc.js",
      "old-files/**",
      "public/**",
    ],
  },
);
