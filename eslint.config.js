import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/**", ".artifacts/**"],
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.{js,mjs,ts}", "*.config.{js,ts}"],
    languageOptions: {
      globals: Object.fromEntries(
        [
          "process",
          "Buffer",
          "console",
          "URL",
          "URLSearchParams",
          "fetch",
          "Headers",
          "Request",
          "Response",
          "AbortController",
          "AbortSignal",
          "TextEncoder",
          "TextDecoder",
          "WebSocket",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "performance",
        ].map((name) => [name, "readonly"]),
      ),
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        Image: "readonly",
        ImageData: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLElement: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        PointerEvent: "readonly",
        Event: "readonly",
        EventListener: "readonly",
        CustomEvent: "readonly",
        WebSocket: "readonly",
        crypto: "readonly",
        matchMedia: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly",
        __APP_VERSION__: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": "error",
      "jsx-a11y/label-has-associated-control": [
        "error",
        { controlComponents: ["Select", "Input", "Switch"], depth: 3 },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Use o componente Select do design system em src/components/Select.tsx.",
        },
      ],
    },
  },
);
