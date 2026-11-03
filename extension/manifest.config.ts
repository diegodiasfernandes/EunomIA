import { defineManifest } from "@crxjs/vite-plugin";
import { loadEnv } from "vite";

const CALENDAR_MATCH = "https://calendar.google.com/*";

export default defineManifest(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const apiOrigin = new URL(env.VITE_API_URL || "http://localhost:8000").origin;

    return {
        manifest_version: 3,
        name: "EunomIA para Google Calendar",
        description:
            "Encontra reuniões e prazos nos seus e-mails e leva o que você aprovar para o Google Calendar.",
        version: "0.1.0",
        icons: {
            16: "icons/icon-16.png",
            32: "icons/icon-32.png",
            48: "icons/icon-48.png",
            128: "icons/icon-128.png",
        },
        host_permissions: [`${apiOrigin}/*`],
        content_scripts: [
            {
                matches: [CALENDAR_MATCH],
                js: ["src/content/main.ts"],
                run_at: "document_idle",
            },
        ],
        web_accessible_resources: [
            {
                resources: ["src/panel/index.html"],
                matches: [CALENDAR_MATCH],
            },
        ],
    };
});
