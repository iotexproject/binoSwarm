import eslintGlobalConfig from "../../eslint.config.mjs";

export default [
    {
        ignores: [
            "**/node_modules/*",
            "**/coverage/*",
            "**/dist/*",
            "**/types/*",
            "**/scripts/concatenated-output.ts",
            "docs/",
        ],
    },
    ...eslintGlobalConfig,
];
