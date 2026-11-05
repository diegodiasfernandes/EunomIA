import { useEffect, useEffectEvent, useState } from "react";
import { api } from "./api";
import { useDashboard } from "./queries";

// OAuth runs in a popup window; the backend stores the token and we poll until the Calendar and Tasks scopes show up.
export function useGoogleConnect(onConnected: () => void) {
    const [windowId, setWindowId] = useState<number | null>(null);
    const connecting = windowId !== null;
    const { data } = useDashboard(connecting ? 2_500 : undefined);
    const googleReady =
        Boolean(data?.google.calendar_connected) && Boolean(data?.google.tasks_connected) &&
        Boolean(data?.google.agenda_connected);
    const handleConnected = useEffectEvent(onConnected);

    useEffect(() => {
        if (windowId === null || !googleReady) return;
        chrome.windows.remove(windowId).catch(() => undefined);
        setWindowId(null);
        handleConnected();
    }, [windowId, googleReady]);

    useEffect(() => {
        if (windowId === null) return;
        const listener = (closedId: number) => {
            if (closedId === windowId) setWindowId(null);
        };
        chrome.windows.onRemoved.addListener(listener);
        return () => chrome.windows.onRemoved.removeListener(listener);
    }, [windowId]);

    async function connect() {
        if (typeof chrome === "undefined" || !chrome.windows?.create) {
            window.open(api.googleAuthUrl, "_blank", "noopener");
            return;
        }
        const created = await chrome.windows.create({
            url: api.googleAuthUrl,
            type: "popup",
            width: 520,
            height: 720,
            focused: true,
        });
        if (created?.id !== undefined) setWindowId(created.id);
    }

    return { connect, connecting };
}
