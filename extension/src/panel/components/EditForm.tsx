import { useId, useState, type FormEvent, type ReactNode } from "react";
import { cleanDescription, meetingMinutes, toDateTimeInput } from "../lib/format";
import { useEditItem } from "../lib/queries";
import type { ApprovalItem } from "../lib/types";
import { useToast } from "./Toast";
import { Button } from "./ui";

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: (id: string) => ReactNode;
}) {
    const id = useId();
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-[12.5px] font-medium text-ink-2">
                {label}
            </label>
            {children(id)}
            {hint && <p className="text-[12px] text-ink-3">{hint}</p>}
        </div>
    );
}

interface Draft {
    title: string;
    description: string;
    startsAt: string;
    duration: string;
    location: string;
    dueAt: string;
    reference: string;
    responsible: string;
}

function initialDraft(item: ApprovalItem): Draft {
    const base = {
        title: item.record.title,
        description: cleanDescription(item.record.description),
    };
    if (item.kind === "meeting") {
        return {
            ...base,
            startsAt: toDateTimeInput(item.record.starts_at),
            duration: String(Math.max(15, meetingMinutes(item.record))),
            location: item.record.location ?? "",
            dueAt: "",
            reference: "",
            responsible: "",
        };
    }
    return {
        ...base,
        startsAt: "",
        duration: "60",
        location: "",
        dueAt: toDateTimeInput(item.record.due_at),
        reference: item.record.deadline_reference ?? "",
        responsible: item.record.responsible ?? "",
    };
}

export function EditForm({ item, onDone }: { item: ApprovalItem; onDone: () => void }) {
    const [draft, setDraft] = useState(() => initialDraft(item));
    const [localError, setLocalError] = useState("");
    const edit = useEditItem();
    const toast = useToast();
    const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
        setDraft((current) => ({ ...current, [key]: event.target.value }));

    function submit(event: FormEvent) {
        event.preventDefault();
        setLocalError("");
        const title = draft.title.trim();
        if (!title) return setLocalError("Informe um título.");

        const onSuccess = () => {
            toast("ok", "Alterações salvas.");
            onDone();
        };

        if (item.kind === "meeting") {
            const start = new Date(draft.startsAt);
            const minutes = Number(draft.duration);
            if (Number.isNaN(start.getTime()))
                return setLocalError("Informe a data e o horário de início.");
            if (!Number.isFinite(minutes) || minutes < 15)
                return setLocalError("A duração mínima é de 15 minutos.");
            edit.mutate(
                {
                    kind: "meeting",
                    id: item.record.id,
                    patch: {
                        title,
                        description: draft.description,
                        starts_at: start.toISOString(),
                        ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
                        location: draft.location.trim(),
                    },
                },
                { onSuccess },
            );
            return;
        }

        edit.mutate(
            {
                kind: "deadline",
                id: item.record.id,
                patch: {
                    title,
                    description: draft.description,
                    due_at: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
                    deadline_reference: draft.reference,
                    responsible: draft.responsible,
                },
            },
            { onSuccess },
        );
    }

    const error = localError || edit.error?.message;

    return (
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <Field label="Título">
                    {(id) => (
                        <input
                            id={id}
                            className="field"
                            value={draft.title}
                            onChange={set("title")}
                            required
                        />
                    )}
                </Field>

                {item.kind === "meeting" ? (
                    <>
                        <div className="grid grid-cols-[1fr_96px] gap-3">
                            <Field label="Início">
                                {(id) => (
                                    <input
                                        id={id}
                                        type="datetime-local"
                                        className="field"
                                        value={draft.startsAt}
                                        onChange={set("startsAt")}
                                        required
                                    />
                                )}
                            </Field>
                            <Field label="Duração (min)">
                                {(id) => (
                                    <input
                                        id={id}
                                        type="number"
                                        min={15}
                                        step={5}
                                        inputMode="numeric"
                                        className="field tabular-nums"
                                        value={draft.duration}
                                        onChange={set("duration")}
                                    />
                                )}
                            </Field>
                        </div>
                        <Field label="Local" hint="Endereço, sala ou link da chamada.">
                            {(id) => (
                                <input
                                    id={id}
                                    className="field"
                                    value={draft.location}
                                    onChange={set("location")}
                                />
                            )}
                        </Field>
                    </>
                ) : (
                    <>
                        <Field label="Prazo" hint="Deixe vazio se o e-mail não definiu uma data.">
                            {(id) => (
                                <input
                                    id={id}
                                    type="datetime-local"
                                    className="field"
                                    value={draft.dueAt}
                                    onChange={set("dueAt")}
                                />
                            )}
                        </Field>
                        <Field
                            label="Referência do prazo"
                            hint="Por exemplo: “antes da reunião de sexta”."
                        >
                            {(id) => (
                                <input
                                    id={id}
                                    className="field"
                                    value={draft.reference}
                                    onChange={set("reference")}
                                />
                            )}
                        </Field>
                        <Field label="Responsável">
                            {(id) => (
                                <input
                                    id={id}
                                    className="field"
                                    value={draft.responsible}
                                    onChange={set("responsible")}
                                />
                            )}
                        </Field>
                    </>
                )}

                <Field
                    label="Descrição"
                    hint="Os remetentes do e-mail continuam registrados automaticamente."
                >
                    {(id) => (
                        <textarea
                            id={id}
                            rows={4}
                            className="field resize-y"
                            value={draft.description}
                            onChange={set("description")}
                        />
                    )}
                </Field>

                {error && (
                    <p
                        role="alert"
                        className="rounded-control bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
                    >
                        {error}
                    </p>
                )}
            </div>

            <div className="flex gap-2 border-t border-line bg-surface px-4 py-3">
                <Button variant="ghost" onClick={onDone} disabled={edit.isPending}>
                    Cancelar
                </Button>
                <Button
                    variant="primary"
                    type="submit"
                    className="flex-1"
                    disabled={edit.isPending}
                >
                    {edit.isPending ? "Salvando..." : "Salvar alterações"}
                </Button>
            </div>
        </form>
    );
}
