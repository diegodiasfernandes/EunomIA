import { EnvelopeSimpleIcon, XIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toDateInput } from "../lib/format";
import { Button, IconButton, cn } from "./ui";

const PRESETS = [7, 15, 30];

function daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return toDateInput(date);
}

const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const formatInputDate = (value: string) =>
    shortDate.format(new Date(`${value}T12:00:00`)).replace(/\./g, "");

export function ScanSheet({
    syncing,
    error,
    onSubmit,
    onClose,
}: {
    syncing: boolean;
    error: string | null;
    onSubmit: (range: { email_since: string; email_until: string }) => void;
    onClose: () => void;
}) {
    const today = toDateInput(new Date());
    const [since, setSince] = useState(() => daysAgo(30));
    const [until, setUntil] = useState(today);
    const [runningRange, setRunningRange] = useState<string | null>(null);
    const first = useRef<HTMLButtonElement>(null);
    const invalid = !since || !until || since > until || until > today;

    useEffect(() => {
        first.current?.focus();
    }, []);

    function submit(event: FormEvent) {
        event.preventDefault();
        if (invalid || syncing) return;
        setRunningRange(`${formatInputDate(since)} a ${formatInputDate(until)}`);
        onSubmit({ email_since: since, email_until: until });
    }

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col justify-end"
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    onClose();
                }
            }}
        >
            <motion.button
                type="button"
                aria-label="Fechar"
                tabIndex={-1}
                onClick={onClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 cursor-default bg-scrim"
            />
            <motion.form
                role="dialog"
                aria-modal="true"
                aria-labelledby="scan-title"
                onSubmit={submit}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 40 }}
                className="relative rounded-t-[20px] border-t border-line bg-surface px-4 pt-4 pb-4 shadow-sheet"
            >
                <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
                        <EnvelopeSimpleIcon size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 id="scan-title" className="text-[16px] font-semibold">
                            Varrer e-mails
                        </h2>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                            A EunomIA lê até 50 e-mails do período e envia as reuniões e prazos
                            encontrados para Aprovações.
                        </p>
                    </div>
                    <IconButton label="Fechar" onClick={onClose} className="-mt-1 -mr-1">
                        <XIcon size={18} />
                    </IconButton>
                </div>

                {syncing ? (
                    <div className="mt-5" aria-live="polite">
                        <div
                            className="relative h-1.5 overflow-hidden rounded-full bg-sunken"
                            aria-hidden
                        >
                            <span className="absolute inset-0 bg-linear-to-r from-transparent via-accent to-transparent motion-safe:animate-shimmer" />
                        </div>
                        <p className="mt-3 text-[13px] font-medium">
                            Analisando e-mails{runningRange ? ` de ${runningRange}` : ""}
                        </p>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                            Cada conversa passa pela IA, então isso pode levar alguns minutos. Você
                            pode fechar esta janela; a varredura continua.
                        </p>
                        <Button ref={first} className="mt-4 w-full" onClick={onClose}>
                            Continuar usando o painel
                        </Button>
                    </div>
                ) : (
                    <>
                        <fieldset className="mt-5">
                            <legend className="mb-2 text-[12.5px] font-medium text-ink-2">
                                Período rápido
                            </legend>
                            <div className="flex gap-1.5">
                                {PRESETS.map((days, index) => {
                                    const active = since === daysAgo(days) && until === today;
                                    return (
                                        <button
                                            key={days}
                                            ref={index === 0 ? first : undefined}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => {
                                                setSince(daysAgo(days));
                                                setUntil(today);
                                            }}
                                            className={cn(
                                                "h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors active:translate-y-px",
                                                active
                                                    ? "bg-ink text-surface"
                                                    : "bg-surface text-ink-2 ring-1 ring-line-strong hover:text-ink",
                                            )}
                                        >
                                            Últimos {days} dias
                                        </button>
                                    );
                                })}
                            </div>
                        </fieldset>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="scan-since"
                                    className="text-[12.5px] font-medium text-ink-2"
                                >
                                    De
                                </label>
                                <input
                                    id="scan-since"
                                    type="date"
                                    className="field"
                                    value={since}
                                    max={until || today}
                                    onChange={(event) => setSince(event.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="scan-until"
                                    className="text-[12.5px] font-medium text-ink-2"
                                >
                                    Até
                                </label>
                                <input
                                    id="scan-until"
                                    type="date"
                                    className="field"
                                    value={until}
                                    min={since}
                                    max={today}
                                    onChange={(event) => setUntil(event.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        {(error || (since && until && since > until)) && (
                            <p
                                role="alert"
                                className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
                            >
                                {since > until
                                    ? "A data inicial precisa ser anterior ou igual à final."
                                    : error}
                            </p>
                        )}

                        <div className="mt-5 flex gap-2">
                            <Button variant="ghost" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                className="flex-1"
                                disabled={invalid}
                            >
                                Iniciar varredura
                            </Button>
                        </div>
                    </>
                )}
            </motion.form>
        </div>
    );
}
