import {
    ArrowLeftIcon,
    CalendarBlankIcon,
    EnvelopeSimpleIcon,
    FlagIcon,
    MapPinIcon,
    NotePencilIcon,
    UserIcon,
    type Icon,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    cleanDescription,
    dayLabel,
    formatDuration,
    formatTime,
    initials,
    isOpenStatus,
    meetingEnd,
    meetingMinutes,
    parseSenders,
    sourceLabel,
    STATUS_LABEL,
} from "../lib/format";
import type { ApprovalItem } from "../lib/types";
import { EditForm } from "./EditForm";
import { ActionBar, Assumptions, ConflictNote, useItemActions } from "./item-parts";
import { Pill, type Tone } from "./ui";

function Row({ icon: Glyph, label, children }: { icon: Icon; label: string; children: ReactNode }) {
    return (
        <div className="flex gap-3 py-2.5">
            <Glyph size={18} className="mt-px shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
                <dt className="text-[11.5px] font-medium text-ink-3">{label}</dt>
                <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
            </div>
        </div>
    );
}

function statusTone(status: ApprovalItem["record"]["status"]): Tone {
    if (isOpenStatus(status)) return "accent";
    if (status === "confirmed" || status === "done") return "ok";
    return "muted";
}

export function DetailSheet({
    item,
    startEditing,
    calendarConnected,
    tasksConnected,
    onClose,
}: {
    item: ApprovalItem;
    startEditing: boolean;
    calendarConnected: boolean;
    tasksConnected: boolean;
    onClose: () => void;
}) {
    const open = isOpenStatus(item.record.status);
    const [editing, setEditing] = useState(startEditing && open);
    const actions = useItemActions(item, onClose);
    const back = useRef<HTMLButtonElement>(null);
    const people = parseSenders(item.record.sender);
    const description = cleanDescription(item.record.description);

    useEffect(() => {
        back.current?.focus();
    }, []);

    return (
        <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.stopPropagation();
                if (editing) setEditing(false);
                else onClose();
            }}
            className="absolute inset-0 z-20 flex flex-col bg-surface"
        >
            <div className="flex items-center gap-2 border-b border-line px-2 py-2">
                <button
                    ref={back}
                    type="button"
                    onClick={editing ? () => setEditing(false) : onClose}
                    className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink"
                >
                    <ArrowLeftIcon size={16} weight="bold" />
                    {editing ? "Detalhes" : "Voltar"}
                </button>
                <span className="flex-1" />
                <Pill tone={statusTone(item.record.status)} className="mr-2">
                    {STATUS_LABEL[item.record.status]}
                </Pill>
            </div>

            <div className="px-4 pt-4">
                <p className="text-[12px] font-semibold text-accent-ink">
                    {editing
                        ? `Editar ${item.kind === "meeting" ? "reunião" : "prazo"}`
                        : item.kind === "meeting"
                          ? "Reunião"
                          : "Prazo"}
                </p>
                <h2
                    id="detail-title"
                    className="mt-0.5 text-[18px] leading-snug font-semibold tracking-[-0.01em]"
                >
                    {item.record.title}
                </h2>
            </div>

            {editing ? (
                <EditForm item={item} onDone={() => setEditing(false)} />
            ) : (
                <>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                        <dl className="mt-2 divide-y divide-line">
                            {item.kind === "meeting" ? (
                                <>
                                    <Row icon={CalendarBlankIcon} label="Quando">
                                        {dayLabel(item.record.starts_at)},{" "}
                                        {formatTime(item.record.starts_at)} -{" "}
                                        {formatTime(meetingEnd(item.record).toISOString())}
                                        <span className="text-ink-3">
                                            {" "}
                                            ({formatDuration(meetingMinutes(item.record))})
                                        </span>
                                    </Row>
                                    <Row icon={MapPinIcon} label="Local">
                                        {item.record.location || (
                                            <span className="text-ink-3">Não informado</span>
                                        )}
                                    </Row>
                                </>
                            ) : (
                                <>
                                    <Row icon={FlagIcon} label="Prazo">
                                        {item.record.due_at ? (
                                            `${dayLabel(item.record.due_at)}, ${formatTime(item.record.due_at)}`
                                        ) : (
                                            <span className="text-ink-3">Sem data definida</span>
                                        )}
                                        {item.record.deadline_reference && (
                                            <span className="block text-[12.5px] text-ink-3">
                                                {item.record.deadline_reference}
                                            </span>
                                        )}
                                    </Row>
                                    <Row icon={UserIcon} label="Responsável">
                                        {item.record.responsible || (
                                            <span className="text-ink-3">Não informado</span>
                                        )}
                                    </Row>
                                </>
                            )}
                            <Row
                                icon={EnvelopeSimpleIcon}
                                label={people.length > 1 ? "Remetentes" : "Origem"}
                            >
                                {people.length ? (
                                    <ul className="space-y-2 pt-1">
                                        {people.map((person) => (
                                            <li
                                                key={person.email}
                                                className="flex items-center gap-2.5"
                                            >
                                                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-[10.5px] font-semibold text-ink-2">
                                                    {initials(person.name)}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block truncate text-[13px]">
                                                        {person.name}
                                                    </span>
                                                    <span className="block truncate text-[12px] text-ink-3">
                                                        {person.email}
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    sourceLabel(item.record.source)
                                )}
                            </Row>
                            {description && (
                                <Row icon={NotePencilIcon} label="Descrição">
                                    <span className="block whitespace-pre-wrap text-ink-2">
                                        {description}
                                    </span>
                                </Row>
                            )}
                        </dl>

                        {item.kind === "meeting" && (
                            <ConflictNote meeting={item.record} className="mt-2" />
                        )}
                        <Assumptions items={item.record.inferred_fields} className="mt-3" />
                    </div>

                    {open && (
                        <div className="border-t border-line bg-surface px-4 py-3">
                            <ActionBar
                                item={item}
                                actions={actions}
                                calendarConnected={calendarConnected}
                                tasksConnected={tasksConnected}
                                onEdit={() => setEditing(true)}
                            />
                        </div>
                    )}
                </>
            )}
        </motion.section>
    );
}
