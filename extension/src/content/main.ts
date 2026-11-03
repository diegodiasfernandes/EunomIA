import sparkleSvg from "@phosphor-icons/core/fill/sparkle-fill.svg?raw";
import { HOST_SOURCE, PANEL_SOURCE, type HostMessage, type PanelMessage } from "../shared/bridge";
import styles from "./launcher.css?inline";

const HOST_ID = "eunomia-calendar-assistant";

function mount() {
    if (document.getElementById(HOST_ID)) return;

    const panelUrl = chrome.runtime.getURL("src/panel/index.html");
    const panelOrigin = new URL(panelUrl).origin;

    const host = document.createElement("div");
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = styles;

    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "launcher";
    launcher.title = "EunomIA";
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-controls", "eunomia-panel");

    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.innerHTML = sparkleSvg;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.hidden = true;
    badge.setAttribute("aria-hidden", "true");

    launcher.append(glyph, badge);

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "eunomia-panel";
    panel.dataset.state = "closed";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Assistente EunomIA");

    const frame = document.createElement("iframe");
    frame.src = panelUrl;
    frame.title = "Assistente EunomIA";
    panel.append(frame);

    root.append(style, launcher, panel);
    document.body.append(host);

    let open = false;
    let pending = 0;

    const updateLabel = () => {
        if (open) {
            launcher.setAttribute("aria-label", "Fechar EunomIA");
            return;
        }
        const suffix = pending
            ? `, ${pending} ${pending === 1 ? "item aguardando" : "itens aguardando"} aprovação`
            : "";
        launcher.setAttribute("aria-label", `Abrir EunomIA${suffix}`);
    };

    const post = (type: HostMessage["type"]) => {
        const message: HostMessage = { source: HOST_SOURCE, type };
        frame.contentWindow?.postMessage(message, panelOrigin);
    };

    const setOpen = (next: boolean) => {
        if (open === next) return;
        open = next;
        panel.dataset.state = next ? "open" : "closed";
        launcher.setAttribute("aria-expanded", String(next));
        launcher.tabIndex = next ? -1 : 0;
        updateLabel();
        post(next ? "opened" : "closed");
        if (next) frame.focus();
        else launcher.focus({ preventScroll: true });
    };

    const setPending = (count: number) => {
        const text = count > 99 ? "99+" : String(count);
        const changed = badge.hidden || badge.textContent !== text;
        pending = count;
        badge.hidden = count <= 0;
        badge.textContent = count > 0 ? text : "";
        if (count > 0 && changed) {
            badge.classList.remove("pop");
            void badge.offsetWidth;
            badge.classList.add("pop");
        }
        updateLabel();
    };

    launcher.addEventListener("click", () => setOpen(!open));

    window.addEventListener("message", (event: MessageEvent<PanelMessage | undefined>) => {
        if (event.source !== frame.contentWindow || event.origin !== panelOrigin) return;
        const data = event.data;
        if (data?.source !== PANEL_SOURCE) return;
        if (data.type === "pending-count") setPending(Math.max(0, Number(data.count) || 0));
        if (data.type === "close") setOpen(false);
    });

    updateLabel();
}

mount();
