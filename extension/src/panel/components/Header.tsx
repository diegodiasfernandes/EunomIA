import { ArrowsClockwiseIcon, EnvelopeSimpleIcon, SparkleIcon, XIcon } from "@phosphor-icons/react";
import { isEmbedded, requestClose } from "../lib/host";
import type { GoogleStatus } from "../lib/types";
import { IconButton } from "./ui";

export function Header({
    google,
    syncing,
    onScan,
}: {
    google: GoogleStatus | undefined;
    syncing: boolean;
    onScan: () => void;
}) {
    const subtitle = !google
        ? "Assistente de agenda"
        : google.connected
          ? (google.email ?? "Conta Google conectada")
          : "Nenhuma conta Google conectada";

    return (
        <header className="flex items-center gap-3 px-4 pt-4 pb-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-accent text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]">
                <SparkleIcon size={22} weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
                <h1 className="text-[16px] leading-tight font-semibold tracking-[-0.01em]">
                    EunomIA
                </h1>
                <p className="truncate text-[12.5px] text-ink-3" title={subtitle}>
                    {subtitle}
                </p>
            </div>
            <IconButton
                label={syncing ? "Varredura em andamento" : "Varrer e-mails"}
                onClick={onScan}
                disabled={!google?.connected}
            >
                {syncing ? (
                    <ArrowsClockwiseIcon size={19} className="motion-safe:animate-spin" />
                ) : (
                    <EnvelopeSimpleIcon size={19} />
                )}
            </IconButton>
            {isEmbedded && (
                <IconButton label="Fechar" onClick={requestClose}>
                    <XIcon size={18} />
                </IconButton>
            )}
        </header>
    );
}
