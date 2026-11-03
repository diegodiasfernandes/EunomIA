import {
    HOST_ORIGIN,
    HOST_SOURCE,
    PANEL_SOURCE,
    type HostMessage,
    type PanelMessage,
} from "../../shared/bridge";

export const isEmbedded = window.parent !== window;

function send(message: PanelMessage) {
    if (isEmbedded) window.parent.postMessage(message, HOST_ORIGIN);
}

export const notifyPendingCount = (count: number) =>
    send({ source: PANEL_SOURCE, type: "pending-count", count });

export const requestClose = () => send({ source: PANEL_SOURCE, type: "close" });

export function onHostMessage(handler: (type: HostMessage["type"]) => void) {
    const listener = (event: MessageEvent<HostMessage | undefined>) => {
        if (event.source !== window.parent || event.origin !== HOST_ORIGIN) return;
        if (event.data?.source !== HOST_SOURCE) return;
        handler(event.data.type);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
}
