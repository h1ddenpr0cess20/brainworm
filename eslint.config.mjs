import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  prettier,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  globalIgnores([".next/**", "coverage/**", "out/**", "next-env.d.ts", "electron/**"]),
]);
