import { PaperPlaneRightIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import type { FormEvent, KeyboardEvent, Ref } from "react";

export function Composer({
    value,
    onChange,
    onSend,
    busy,
    inputRef,
}: {
    value: string;
    onChange: (value: string) => void;
    onSend: (text: string) => void;
    busy: boolean;
    inputRef: Ref<HTMLTextAreaElement>;
}) {
    const canSend = Boolean(value.trim()) && !busy;

    function send() {
        if (canSend) onSend(value.trim());
    }

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        send();
    }

    function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
        }
    }

    return (
        <form
            onSubmit={onSubmit}
            className="relative z-10 border-t border-line bg-surface px-3 pt-2.5 pb-3"
        >
            <label htmlFor="composer" className="sr-only">
                Mensagem para a EunomIA
            </label>
            <div className="flex items-end gap-2 rounded-card border border-line-strong bg-surface py-1.5 pr-1.5 pl-3.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
                <textarea
                    id="composer"
                    ref={inputRef}
                    rows={1}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Peça para marcar uma reunião ou um prazo"
                    className="field-sizing-content max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-[13.5px] leading-snug outline-none placeholder:text-ink-3 focus-visible:outline-none"
                />
                <motion.button
                    type="submit"
                    whileTap={canSend ? { scale: 0.92 } : undefined}
                    disabled={!canSend}
                    aria-label="Enviar mensagem"
                    className="grid size-9 shrink-0 place-items-center rounded-control bg-accent text-on-accent transition-opacity disabled:opacity-35"
                >
                    <PaperPlaneRightIcon size={17} weight="fill" />
                </motion.button>
            </div>
        </form>
    );
}
