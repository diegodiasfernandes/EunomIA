import {
    ArrowRightIcon,
    CalendarPlusIcon,
    CheckIcon,
    FlagIcon,
    SparkleIcon,
    WarningCircleIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { useAddDraft } from "../lib/queries";
import type { ChatMessage, DraftState } from "../lib/useChatSession";
import { ItemMeta } from "./item-parts";
import { useToast } from "./Toast";
import { Button, cn } from "./ui";

const SUGGESTIONS = [
    "Marcar reunião com a Ana amanhã às 10h",
    "Preciso entregar o relatório até sexta",
    "Consulta no dentista dia 12 às 15h30",
];

function DraftCard({
    message,
    onState,
    onReview,
}: {
    message: ChatMessage;
    onState: (state: DraftState) => void;
    onReview: () => void;
}) {
    const toast = useToast();
    const add = useAddDraft();
    const draft = message.draft;
    if (!draft) return null;
    const isMeeting = draft.kind === "meeting";

    function confirm() {
        if (!draft) return;
        add.mutate(draft, {
            onSuccess: () => {
                onState("added");
                toast(
                    "ok",
                    isMeeting
                        ? "Reunião enviada para aprovações."
                        : "Prazo enviado para aprovações.",
                );
            },
        });
    }

    return (
        <div className="mt-2.5 rounded-card border border-line bg-surface p-3.5 shadow-card">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-ink">
                {isMeeting ? (
                    <CalendarPlusIcon size={15} weight="bold" />
                ) : (
                    <FlagIcon size={15} weight="bold" />
                )}
                {isMeeting ? "Nova reunião" : "Novo prazo"}
            </span>
            <p className="mt-1 text-[14px] leading-snug font-semibold">{draft.record.title}</p>
            <ItemMeta item={draft} className="mt-1.5" />

            {message.draftState === "open" ? (
                <>
                    <div className="mt-3 flex gap-1.5">
                        <Button
                            variant="primary"
                            className="flex-1"
                            onClick={confirm}
                            disabled={add.isPending}
                        >
                            <CheckIcon size={15} weight="bold" />
                            {add.isPending ? "Enviando..." : "Enviar para aprovações"}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => onState("dismissed")}
                            disabled={add.isPending}
                        >
                            Descartar
                        </Button>
                    </div>
                    {add.error && (
                        <p role="alert" className="mt-2 text-[12.5px] text-danger">
                            {add.error.message}
                        </p>
                    )}
                </>
            ) : message.draftState === "added" ? (
                <button
                    type="button"
                    onClick={onReview}
                    className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ok hover:underline"
                >
                    <CheckIcon size={14} weight="bold" />
                    Em aprovações. Revisar agora
                    <ArrowRightIcon size={13} weight="bold" />
                </button>
            ) : (
                <p className="mt-3 text-[12.5px] text-ink-3">Descartado.</p>
            )}
        </div>
    );
}

export function ConversationView({
    messages,
    thinking,
    onDraftState,
    onSuggestion,
    onReview,
}: {
    messages: ChatMessage[];
    thinking: boolean;
    onDraftState: (id: string, state: DraftState) => void;
    onSuggestion: (text: string) => void;
    onReview: () => void;
}) {
    const end = useRef<HTMLDivElement>(null);
    const reduce = useReducedMotion();

    useEffect(() => {
        // scrollIntoView could also scroll the Calendar page that hosts this iframe.
        const scroller = end.current?.closest("main");
        scroller?.scrollTo({ top: scroller.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    }, [messages.length, thinking, reduce]);

    if (!messages.length) {
        return (
            <div className="px-5 py-7">
                <span className="grid size-11 place-items-center rounded-card bg-accent-soft text-accent">
                    <SparkleIcon size={22} weight="fill" />
                </span>
                <h2 className="mt-3 text-[15px] font-semibold">Peça em linguagem natural</h2>
                <p className="mt-1 max-w-[36ch] text-[13px] leading-relaxed text-ink-3">
                    Descreva uma reunião ou um prazo. A EunomIA monta o registro e você decide se
                    ele vai para as aprovações.
                </p>
                <div className="mt-5 flex flex-col items-start gap-2">
                    {SUGGESTIONS.map((text) => (
                        <button
                            key={text}
                            type="button"
                            onClick={() => onSuggestion(text)}
                            className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent-ink active:translate-y-px"
                        >
                            {text}
                        </button>
                    ))}
                </div>
                <p className="mt-6 text-[11.5px] text-ink-3">
                    A IA pode errar. Revise cada item antes de confirmar.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4 px-4 py-4">
            {messages.map((message) => (
                <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className={cn("flex gap-2.5", message.role === "user" && "justify-end")}
                >
                    {message.role === "assistant" && (
                        <span
                            className={cn(
                                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                                message.failed
                                    ? "bg-danger-soft text-danger"
                                    : "bg-accent text-on-accent",
                            )}
                        >
                            {message.failed ? (
                                <WarningCircleIcon size={14} weight="fill" />
                            ) : (
                                <SparkleIcon size={13} weight="fill" />
                            )}
                        </span>
                    )}
                    <div
                        className={cn(
                            "min-w-0",
                            message.role === "user" ? "max-w-[82%]" : "flex-1",
                        )}
                    >
                        <p
                            className={cn(
                                "text-[13.5px] leading-relaxed whitespace-pre-wrap",
                                message.role === "user" &&
                                    "rounded-card rounded-br-md bg-accent-soft px-3.5 py-2 text-ink",
                                message.failed && "text-danger",
                            )}
                        >
                            {message.text}
                        </p>
                        {message.draft && (
                            <DraftCard
                                message={message}
                                onState={(state) => onDraftState(message.id, state)}
                                onReview={onReview}
                            />
                        )}
                    </div>
                </motion.div>
            ))}
            {thinking && (
                <div className="flex items-center gap-2.5" aria-label="EunomIA está respondendo">
                    <span className="grid size-6 place-items-center rounded-full bg-accent text-on-accent">
                        <SparkleIcon size={13} weight="fill" />
                    </span>
                    <span className="flex gap-1">
                        {[0, 1, 2].map((dot) => (
                            <span
                                key={dot}
                                className="size-1.5 rounded-full bg-ink-3 motion-safe:animate-typing"
                                style={{ animationDelay: `${dot * 0.15}s` }}
                            />
                        ))}
                    </span>
                </div>
            )}
            <div ref={end} />
        </div>
    );
}
