import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "apps/mobile/babel.config.js",
    "apps/mobile/metro.config.js",
    "apps/mobile/nativewind-resolve.js",
    "apps/mobile/postcss.config.js",
    "apps/mobile/tailwind.config.js",
  ]),
]);

export default eslintConfig;
