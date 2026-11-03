import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.config.ts";

export default defineConfig({
    plugins: [react(), tailwindcss(), crx({ manifest })],
    build: {
        // Loaded from the unpacked extension on disk, not over the network.
        chunkSizeWarningLimit: 800,
        rolldownOptions: {
            // The panel is only referenced from web_accessible_resources, so CRXJS needs it as an explicit input.
            input: { panel: "src/panel/index.html" },
        },
    },
    server: {
        port: 5174,
        strictPort: true,
        cors: { origin: [/^chrome-extension:\/\//] },
    },
});
