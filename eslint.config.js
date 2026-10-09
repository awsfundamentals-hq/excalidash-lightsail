import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["cdk.out/", "node_modules/"] },
  ...tseslint.configs.recommended,
);
