import { CheckCircleIcon, PlusIcon, SignOutIcon, XIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { GoogleStatus } from "../lib/types";
import { Button } from "./ui";

export function AccountsSheet({ google, pending, error, onDisconnect, onConnect, onClose }: {
    google: GoogleStatus | undefined;
    pending: boolean;
    error: string | null;
    onDisconnect: () => void;
    onConnect: () => void;
    onClose: () => void;
}) {
    const [confirming, setConfirming] = useState(false);
    const dialog = useRef<HTMLElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        close.current?.focus();
        return () => previous?.focus();
    }, []);
    useEffect(() => {
        if (confirming) dialog.current?.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    }, [confirming]);

    function onKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key !== "Tab") return;
        const buttons = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled)");
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }

    const name = google?.name || "Conta Google";
    const initial = (google?.name || google?.email || "G").charAt(0).toUpperCase();
    return (
        <div className="absolute inset-0 z-30 flex flex-col justify-end" onKeyDown={onKeyDown}>
            <motion.button type="button" aria-label="Fechar contas conectadas" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="accounts-title" className="relative rounded-t-[20px] border-t border-line bg-surface p-4 shadow-sheet" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }}>
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 id="accounts-title" className="text-[16px] font-semibold">Contas conectadas</h2>
                    <button ref={close} type="button" aria-label="Fechar" onClick={onClose} className="grid size-9 place-items-center rounded-control text-ink-3 hover:bg-sunken"><XIcon size={18} /></button>
                </div>
                {google?.connected ? <>
                    <div className="mb-4 flex items-center gap-3 border-b border-line pb-4">
                        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-[19px] font-semibold text-on-accent">{initial}</span>
                        <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold">{name}</p><p className="break-all text-[12.5px] text-ink-3">{google.email}</p></div>
                        <CheckCircleIcon size={19} className="shrink-0 text-ok" aria-label="Conta conectada" />
                    </div>
                    {confirming ? <div className="space-y-3">
                        <p className="text-[13px] leading-relaxed text-ink-2">Você deseja desconectar sua conta Google da EunomIA? Para voltar a sincronizar seus e-mails e compromissos, será necessário conectar uma conta novamente.</p>
                        <div className="flex flex-wrap gap-2"><Button data-cancel disabled={pending} onClick={() => setConfirming(false)}>Cancelar</Button><Button variant="primary" disabled={pending} onClick={onDisconnect}>{pending ? "Desconectando…" : "Confirmar desconexão"}</Button></div>
                    </div> : <>
                        <div className="flex gap-2">
                            <Button className="min-w-0 flex-1 px-2" onClick={() => setConfirming(true)}><SignOutIcon size={16} />Desconectar</Button>
                            <Button disabled className="h-auto min-h-9 min-w-0 flex-1 whitespace-normal px-2 text-[12px] leading-tight" aria-describedby="account-soon"><PlusIcon size={16} />Adicionar nova conta</Button>
                        </div>
                        <p id="account-soon" className="mt-2 text-right text-[11px] text-ink-3">Adicionar nova conta — Em breve</p>
                    </>}
                    {error && <p role="alert" className="mt-3 rounded-control bg-danger-soft p-3 text-[13px] text-danger">{error}</p>}
                </> : <div className="space-y-3"><p className="text-[13px] text-ink-3">Nenhuma conta Google conectada.</p><Button onClick={onConnect}>Conectar conta Google</Button></div>}
            </motion.section>
        </div>
    );
}
