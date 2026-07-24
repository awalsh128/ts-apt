import { fileURLToPath } from "node:url";

import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const tsFiles = ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.mts"];
const tsconfigRootDir = fileURLToPath(new URL(".", import.meta.url));

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  ...tsPlugin.configs["flat/recommended-type-checked"].map((config) => ({
    ...config,
    files: tsFiles,
    languageOptions: {
      ...config.languageOptions,
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        projectService: true,
        tsconfigRootDir,
      },
    },
  })),
  ...tsPlugin.configs["flat/stylistic-type-checked"].map((config) => ({
    ...config,
    files: tsFiles,
  })),
];
