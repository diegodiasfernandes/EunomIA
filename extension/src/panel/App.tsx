import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CalendarAgenda } from "./components/CalendarAgenda";
import { AccountsSheet } from "./components/AccountsSheet";
import { ApiErrorState } from "./components/ApiErrorState";
import { ApprovalsView, type ApprovalFilter } from "./components/Approvals";
import { Composer } from "./components/Composer";
import { ConversationView } from "./components/Conversation";
import { DetailSheet } from "./components/DetailSheet";
import { Header } from "./components/Header";
import { OverviewView } from "./components/Overview";
import { ScanSheet } from "./components/ScanSheet";
import { Tabs, type TabId } from "./components/Tabs";
import { ToastProvider, useToast } from "./components/Toast";
import { plural } from "./lib/format";
import { notifyPendingCount, onHostMessage, requestClose } from "./lib/host";
import { queryKeys, useDashboard, useSyncEmails, useWorkspace } from "./lib/queries";
import { api } from "./lib/api";
import type { ApprovalItem, Dashboard, Meeting, SyncRange, SyncResult } from "./lib/types";
import { useChatSession } from "./lib/useChatSession";
import { useGoogleConnect } from "./lib/useGoogleConnect";

export function App() {
    return (
        <div className="relative h-full overflow-hidden bg-surface">
            <ToastProvider>
                <AccountPanel />
            </ToastProvider>
        </div>
    );
}

function AccountPanel() {
    const { data } = useDashboard();
    const toast = useToast();
    const google = useGoogleConnect(() => toast("ok", "Conta Google conectada."));
    return <Panel key={data?.google.connection_id ?? "loading"} google={google} />;
}

function Panel({ google }: { google: ReturnType<typeof useGoogleConnect> }) {
    const workspace = useWorkspace();
    const toast = useToast();
    const client = useQueryClient();
    const chat = useChatSession();
    const sync = useSyncEmails();


    const [tab, setTab] = useState<TabId>("overview");
    const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("pending");
    const [detail, setDetail] = useState<{ item: ApprovalItem; editing: boolean } | null>(null);
    const [scanOpen, setScanOpen] = useState(false);
    const [accountsOpen, setAccountsOpen] = useState(false);
    const [lastSync, setLastSync] = useState<SyncResult | null>(null);
    const [draft, setDraft] = useState("");
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const mainRef = useRef<HTMLElement>(null);

    const disconnect = useMutation({
        mutationFn: () => api.disconnectGoogle(workspace.google?.email ?? ""),
        onSuccess: async () => {
            await client.cancelQueries();
            client.removeQueries({ predicate: (query) => query.queryKey[0] !== "dashboard" });
            client.setQueryData<Dashboard>(queryKeys.dashboard, {
                tasks: [], google: { connected: false, email: null, name: null,
                    connection_id: "offline", calendar_connected: false, tasks_connected: false, agenda_connected: false },
            });
            void client.invalidateQueries({ queryKey: queryKeys.dashboard });
            toast("ok", "Conta Google desconectada.");
        },
    });

    const pendingCount = workspace.approvals.length;

    useEffect(() => {
        if (!workspace.isLoading) notifyPendingCount(pendingCount);
    }, [pendingCount, workspace.isLoading]);

    useEffect(
        () =>
            onHostMessage((type) => {
                if (type === "opened") void client.invalidateQueries();
            }),
        [client],
    );

    useEffect(() => {
        mainRef.current?.scrollTo({ top: 0 });
    }, [tab]);

    // Keep the open sheet in sync with refetched data; fall back to the snapshot once the item leaves the lists.
    const liveDetail = useMemo<ApprovalItem | null>(() => {
        if (!detail) return null;
        const { item } = detail;
        if (item.kind === "meeting") {
            const fresh = workspace.meetings.find((meeting) => meeting.id === item.record.id);
            return fresh ? { kind: "meeting", record: fresh } : item;
        }
        return (
            workspace.approvals.find(
                (entry) => entry.kind === "deadline" && entry.record.id === item.record.id,
            ) ?? item
        );
    }, [detail, workspace.meetings, workspace.approvals]);

    const openItem = (item: ApprovalItem, editing = false) => setDetail({ item, editing });
    const openMeeting = (meeting: Meeting) => openItem({ kind: "meeting", record: meeting });

    function startScan(range: SyncRange) {
        sync.mutate(range, {
            onSuccess: (result) => {
                setLastSync(result);
                setScanOpen(false);
                if (result.pending_items > 0) {
                    setApprovalFilter("pending");
                    setTab("approvals");
                    toast(
                        "ok",
                        `Varredura concluída: ${plural(result.pending_items, "item aguardando", "itens aguardando")} aprovação.`,
                    );
                } else {
                    toast(
                        "info",
                        `Varredura concluída: ${plural(result.emails, "e-mail analisado", "e-mails analisados")} e nenhum compromisso novo.`,
                    );
                }
            },
            onError: () => setScanOpen(true),
        });
    }

    function sendMessage(text: string) {
        chat.send(text);
        setDraft("");
        setTab("chat");
    }

    function onKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape" && !detail && !scanOpen && !accountsOpen) requestClose();
    }

    const blockingError = workspace.error && !workspace.hasData ? workspace.error : null;

    let view: ReactNode;
    if (tab === "overview") {
        view = (
            <OverviewView
                google={workspace.google}
                approvals={workspace.approvals}
                conflicts={workspace.conflicts}
                upcoming={workspace.upcoming}
                loading={workspace.isLoading}
                syncing={sync.isPending}
                lastSync={lastSync}
                connecting={google.connecting}
                onConnect={google.connect}
                onScan={() => setScanOpen(true)}
                onReview={() => { setApprovalFilter("pending"); setTab("approvals"); }}
                onConflicts={() => {
                    setApprovalFilter("conflicts");
                    setTab("approvals");
                }}
                onAgenda={() => setTab("agenda")}
                onOpenMeeting={openMeeting}
            />
        );
    } else if (tab === "approvals") {
        view = (
            <ApprovalsView
                filter={approvalFilter}
                onFilter={setApprovalFilter}
                conflicts={workspace.conflicts}
                history={workspace.history}
                items={workspace.approvals}
                google={workspace.google}
                loading={workspace.isLoading}
                connecting={google.connecting}
                onConnect={google.connect}
                onScan={() => setScanOpen(true)}
                onOpen={(item) => openItem(item)}
                onEdit={(item) => openItem(item, true)}
            />
        );
    } else if (tab === "agenda") {
        view = (
            <CalendarAgenda
                google={workspace.google}
                connecting={google.connecting}
                onConnect={google.connect}
            />
        );
    } else {
        view = (
            <ConversationView
                messages={chat.messages}
                thinking={chat.thinking}
                onDraftState={chat.setDraftState}
                onReview={() => { setApprovalFilter("pending"); setTab("approvals"); }}
                onSuggestion={(text) => {
                    setDraft(text);
                    composerRef.current?.focus();
                }}
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col" onKeyDown={onKeyDown}>
            <Header
                onAccounts={() => { disconnect.reset(); setAccountsOpen(true); }}
                google={workspace.google}
                syncing={sync.isPending}
                onScan={() => setScanOpen(true)}
            />
            <Tabs
                value={tab}
                onChange={setTab}
                approvals={pendingCount}
            />

            <main
                ref={mainRef}
                id="panel-view"
                role="tabpanel"
                aria-labelledby={`tab-${tab}`}
                className="relative min-h-0 flex-1 overflow-y-auto bg-canvas"
            >
                {blockingError ? (
                    <ApiErrorState
                        error={blockingError}
                        retrying={workspace.isFetching}
                        onRetry={() => void workspace.refetch()}
                    />
                ) : (
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={tab}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        >
                            {view}
                        </motion.div>
                    </AnimatePresence>
                )}
            </main>

            <Composer
                value={draft}
                onChange={setDraft}
                onSend={sendMessage}
                busy={chat.thinking}
                inputRef={composerRef}
            />

            <AnimatePresence>
                {liveDetail && detail && (
                    <DetailSheet
                        key={liveDetail.record.id}
                        item={liveDetail}
                        startEditing={detail.editing}
                        calendarConnected={Boolean(workspace.google?.calendar_connected)}
                        tasksConnected={Boolean(workspace.google?.tasks_connected)}
                        onClose={() => setDetail(null)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {accountsOpen && <AccountsSheet
                    google={workspace.google}
                    pending={disconnect.isPending}
                    error={disconnect.error?.message ?? null}
                    onDisconnect={() => disconnect.mutate()}
                    onConnect={() => { setAccountsOpen(false); void google.connect(); }}
                    onClose={() => setAccountsOpen(false)}
                />}
            </AnimatePresence>

            <AnimatePresence>
                {scanOpen && (
                    <ScanSheet
                        syncing={sync.isPending}
                        error={sync.error?.message ?? null}
                        onSubmit={startScan}
                        onClose={() => setScanOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
