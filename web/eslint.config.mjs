import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import sourceLanguage from "../scripts/eslint-source-language.mjs";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    plugins: { "corneta-source": sourceLanguage },
    rules: { "corneta-source/english-source": "error" },
  },
  globalIgnores([".next*/**", "out/**", "build/**", "next-env.d.ts"]),
]);
