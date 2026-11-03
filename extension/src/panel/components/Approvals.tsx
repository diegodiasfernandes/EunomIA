import {
    CalendarPlusIcon,
    CheckCircleIcon,
    EnvelopeSimpleIcon,
    FlagIcon,
    GoogleLogoIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { parseSenders, plural, sourceLabel } from "../lib/format";
import type { ApprovalItem, GoogleStatus } from "../lib/types";
import {
    ActionBar,
    Assumptions,
    ConflictNote,
    ItemMeta,
    senderSummary,
    useItemActions,
} from "./item-parts";
import { Avatars, Button, SectionTitle, Skeleton } from "./ui";

function ApprovalCard({
    item,
    calendarConnected,
    onOpen,
    onEdit,
}: {
    item: ApprovalItem;
    calendarConnected: boolean;
    onOpen: () => void;
    onEdit: () => void;
}) {
    const actions = useItemActions(item);
    const people = parseSenders(item.record.sender);
    const isMeeting = item.kind === "meeting";

    return (
        <article className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-ink">
                    {isMeeting ? (
                        <CalendarPlusIcon size={15} weight="bold" />
                    ) : (
                        <FlagIcon size={15} weight="bold" />
                    )}
                    {isMeeting ? "Reunião identificada" : "Prazo identificado"}
                </span>
                <span className="text-[11.5px] text-ink-3">
                    via {sourceLabel(item.record.source).toLowerCase()}
                </span>
            </div>

            <button
                type="button"
                onClick={onOpen}
                className="block w-full rounded-sm text-left text-[15px] leading-snug font-semibold tracking-[-0.005em] text-ink transition-colors hover:text-accent-ink"
            >
                {item.record.title}
            </button>

            <ItemMeta item={item} className="mt-2" />

            {people.length > 0 && (
                <div className="mt-3 flex min-w-0 items-center gap-2.5">
                    <Avatars people={people} />
                    <span className="truncate text-[12.5px] text-ink-3">
                        {senderSummary(people)}
                    </span>
                </div>
            )}

            {isMeeting && <ConflictNote meeting={item.record} className="mt-3" />}
            <Assumptions items={item.record.inferred_fields} className="mt-3" />

            <div className="mt-4">
                <ActionBar
                    item={item}
                    actions={actions}
                    calendarConnected={calendarConnected}
                    onEdit={onEdit}
                />
            </div>
        </article>
    );
}

export function ApprovalsView({
    items,
    google,
    loading,
    onOpen,
    onEdit,
    onScan,
    onConnect,
    connecting,
}: {
    items: ApprovalItem[];
    google: GoogleStatus | undefined;
    loading: boolean;
    onOpen: (item: ApprovalItem) => void;
    onEdit: (item: ApprovalItem) => void;
    onScan: () => void;
    onConnect: () => void;
    connecting: boolean;
}) {
    if (loading) {
        return (
            <div className="space-y-3 p-3">
                {[0, 1].map((key) => (
                    <div
                        key={key}
                        className="space-y-3 rounded-card border border-line bg-surface p-4"
                    >
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-3 w-3/5" />
                        <Skeleton className="h-9 w-full rounded-control" />
                    </div>
                ))}
            </div>
        );
    }

    if (!items.length) {
        const connected = google?.connected;
        return (
            <div className="flex flex-col items-start gap-3 px-5 py-8">
                <span className="grid size-11 place-items-center rounded-card bg-ok-soft text-ok">
                    <CheckCircleIcon size={24} weight="fill" />
                </span>
                <div>
                    <h2 className="text-[15px] font-semibold">Nada aguardando aprovação</h2>
                    <p className="mt-1 max-w-[34ch] text-[13px] leading-relaxed text-ink-3">
                        {connected
                            ? "Varra seus e-mails para a EunomIA procurar reuniões e prazos novos."
                            : "Conecte sua conta Google para a EunomIA procurar reuniões e prazos nos seus e-mails."}
                    </p>
                </div>
                {connected ? (
                    <Button variant="secondary" onClick={onScan}>
                        <EnvelopeSimpleIcon size={16} />
                        Varrer e-mails
                    </Button>
                ) : (
                    <Button variant="primary" onClick={onConnect} disabled={connecting}>
                        <GoogleLogoIcon size={16} weight="bold" />
                        {connecting ? "Aguardando autorização..." : "Conectar Google"}
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className="p-3">
            <SectionTitle
                aside={
                    <span className="text-[12px] text-ink-3 tabular-nums">
                        {plural(items.length, "item", "itens")}
                    </span>
                }
            >
                Aguardando sua aprovação
            </SectionTitle>
            <ul className="space-y-3">
                <AnimatePresence initial={false} mode="popLayout">
                    {items.map((item) => (
                        <motion.li
                            key={item.record.id}
                            layout
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                            transition={{ type: "spring", stiffness: 380, damping: 34 }}
                        >
                            <ApprovalCard
                                item={item}
                                calendarConnected={Boolean(google?.calendar_connected)}
                                onOpen={() => onOpen(item)}
                                onEdit={() => onEdit(item)}
                            />
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ul>
        </div>
    );
}
