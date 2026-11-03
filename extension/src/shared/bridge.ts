export const HOST_ORIGIN = "https://calendar.google.com";

export const PANEL_SOURCE = "eunomia-panel";
export const HOST_SOURCE = "eunomia-host";

export type PanelMessage =
    | { source: typeof PANEL_SOURCE; type: "pending-count"; count: number }
    | { source: typeof PANEL_SOURCE; type: "close" };

export type HostMessage = { source: typeof HOST_SOURCE; type: "opened" | "closed" };
