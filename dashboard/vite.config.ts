import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dataApiPlugin } from "./vite-plugin-data-api";
import { resolve } from "path";

export default defineConfig({
    plugins: [react(), tailwindcss(), dataApiPlugin()],
    resolve: {
        alias: {
            "@planner/types": resolve(__dirname, "../src/types.ts"),
        },
    },
});
