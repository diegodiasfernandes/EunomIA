import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Mail,
  Menu,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const TABS = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "pendencias", label: "Pendências", icon: CheckCheck },
  { id: "conflitos", label: "Conflitos", icon: AlertTriangle },
];

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("Não foi possível acessar a API. Confirme se o backend está em execução.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Não foi possível concluir esta ação.");
  return body;
}

function localDateValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function localDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function dateTimeInputIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Não informada";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  if (!remainingMinutes) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [events, setEvents] = useState([]);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Olá! Posso ajudar com seus compromissos e pendências. Quando quiser, varro seus e-mails no período que você escolher." },
  ]);
  const [draft, setDraft] = useState("");
  const [activeTab, setActiveTab] = useState(() => {
    const requested = window.location.hash.slice(1);
    return TABS.some((tab) => tab.id === requested) ? requested : "chat";
  });
  const [loading, setLoading] = useState(false);
  const [confirmingEventId, setConfirmingEventId] = useState("");
  const [reviewingEventId, setReviewingEventId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanSince, setScanSince] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return localDateValue(date);
  });
  const [scanUntil, setScanUntil] = useState(() => localDateValue(new Date()));
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedPending, setSelectedPending] = useState(null);
  const [editingDetected, setEditingDetected] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [savingDetected, setSavingDetected] = useState(false);

  const refresh = useCallback(async () => {
    const [nextDashboard, nextEvents] = await Promise.all([
      api("/api/dashboard"),
      api("/api/events"),
    ]);
    setDashboard(nextDashboard);
    setEvents(nextEvents.events);
    setPageError("");
  }, []);

  useEffect(() => {
    refresh().catch((error) => setPageError(error.message));
    if (new URLSearchParams(window.location.search).get("google") === "connected") {
      setToast("Conta Google conectada. Escolha o período para a primeira varredura.");
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    }
  }, [refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onHashChange = () => {
      const requested = window.location.hash.slice(1);
      if (TABS.some((tab) => tab.id === requested)) setActiveTab(requested);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function selectTab(tab) {
    setActiveTab(tab);
    window.history.replaceState({}, "", `#${tab}`);
    setMobileNavOpen(false);
  }

  async function connectGoogle() {
    try {
      await api("/api/integrations/google/status");
      window.location.href = `${API}/api/integrations/google/auth`;
    } catch (error) {
      setPageError(error.message);
    }
  }

  async function scanEmails(event) {
    event.preventDefault();
    setSyncing(true);
    setScanError("");
    try {
      const result = await api("/api/integrations/google/sync", {
        method: "POST",
        body: JSON.stringify({ email_since: scanSince, email_until: scanUntil }),
      });
      await refresh();
      setShowScanDialog(false);
      setToast(`Varredura concluída: ${result.result.emails} e-mails e ${result.result.email_threads_with_events} possíveis compromissos.`);
    } catch (error) {
      setScanError(error.message);
    } finally {
      setSyncing(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    setMessages((current) => [...current, { role: "user", text }]);
    setLoading(true);
    try {
      const response = await api("/api/chat", { method: "POST", body: JSON.stringify({ message: text }) });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: response.reply,
          pendingDraft: response.action === "record_confirmation_required"
            ? { type: response.record_type, record: response.record }
            : null,
        },
      ]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: `Não consegui concluir: ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmChatRecord(draftRecord) {
    const { type, record } = draftRecord;
    setConfirmingEventId(record.id);
    try {
      await api(type === "meeting" ? "/api/events" : "/api/tasks", {
        method: "POST",
        body: JSON.stringify(record),
      });
      await refresh();
      setMessages((current) => current.map((message) => (
        message.pendingDraft?.record.id === record.id
          ? {
              ...message,
              pendingDraft: null,
              text: `${type === "meeting" ? "Reunião" : "Tarefa"} adicionada às Pendências.`,
            }
          : message
      )));
      setToast(`${type === "meeting" ? "Reunião" : "Tarefa"} adicionada às Pendências.`);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setConfirmingEventId("");
    }
  }

  async function completeTask(task) {
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
      await refresh();
      setToast("Pendência concluída.");
    } catch (error) {
      setPageError(error.message);
    }
  }

  async function reviewDetected(item, status) {
    setReviewingEventId(item.record.id);
    try {
      await api(`${item.type === "meeting" ? "/api/events" : "/api/tasks"}/${item.record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refresh();
      setToast(status === "pending"
        ? `${item.type === "meeting" ? "Reunião" : "Prazo"} aceito e adicionado às Pendências.`
        : `${item.type === "meeting" ? "Reunião" : "Prazo"} recusado e removido da revisão.`);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setReviewingEventId("");
    }
  }

  function editDetected(item) {
    const record = item.record;
    const isMeeting = item.type === "meeting";
    const durationMinutes = isMeeting
      ? Math.max(
          15,
          Math.round(
            (new Date(record.ends_at).getTime() - new Date(record.starts_at).getTime()) / 60000,
          ),
        )
      : null;
    setSelectedPending(item);
    setEditDraft({
      title: record.title || "",
      description: record.description || "",
      startsAt: isMeeting ? localDateTimeValue(record.starts_at) : "",
      durationMinutes: durationMinutes ?? 60,
      location: record.location || "",
      dueAt: !isMeeting ? localDateTimeValue(record.due_at) : "",
      responsible: !isMeeting ? record.responsible || "" : "",
      deadlineReference: !isMeeting ? record.deadline_reference || "" : "",
    });
    setEditingDetected(true);
  }

  function closePendingDetails() {
    setSelectedPending(null);
    setEditingDetected(false);
    setEditDraft(null);
  }

  async function saveDetectedEdit(event) {
    event.preventDefault();
    if (!selectedPending || !editDraft) return;
    const { record, type } = selectedPending;
    const isMeeting = type === "meeting";
    setSavingDetected(true);
    try {
      const payload = isMeeting
        ? {
            title: editDraft.title,
            description: editDraft.description,
            starts_at: dateTimeInputIso(editDraft.startsAt),
            ends_at: new Date(
              new Date(editDraft.startsAt).getTime()
              + Number(editDraft.durationMinutes) * 60000,
            ).toISOString(),
            location: editDraft.location,
          }
        : {
            title: editDraft.title,
            description: editDraft.description,
            due_at: dateTimeInputIso(editDraft.dueAt),
            responsible: editDraft.responsible,
            deadline_reference: editDraft.deadlineReference,
          };
      await api(`${isMeeting ? "/api/events" : "/api/tasks"}/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await refresh();
      setSelectedPending(null);
      setEditingDetected(false);
      setEditDraft(null);
      setToast("Alterações salvas. O item continua aguardando sua revisão.");
    } catch (error) {
      setPageError(error.message);
    } finally {
      setSavingDetected(false);
    }
  }

  const detectedEvents = events.filter((event) => event.status === "detected" && event.source === "email");
  const conflicts = events.filter((event) => event.conflict);
  const tasks = dashboard?.tasks || [];
  const detectedTasks = tasks.filter((task) => task.status === "detected" && task.source === "email");
  const pendingTasks = tasks.filter((task) => task.status === "pending");
  const detectedItems = [
    ...detectedEvents.map((record) => ({ type: "meeting", record })),
    ...detectedTasks.map((record) => ({ type: "deadline", record })),
  ];
  const pendingMeetings = events.filter((event) => (
    event.status === "pending" || (event.status === "detected" && event.source !== "email")
  ));
  const pendingCount = pendingTasks.length + pendingMeetings.length;
  const googleConnected = dashboard?.google.connected;
  const today = localDateValue(new Date());

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Fechar menu" />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="#chat" onClick={() => selectTab("chat")} aria-label="EunomIA início">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span className="brand-name">eunom<span>IA</span><small>ASSISTENTE PESSOAL</small></span>
        </a>
        <div className="workspace-label">SEU ESPAÇO</div>
        <nav className="navigation" role="tablist" aria-label="Navegação principal">
          {TABS.map(({ id, label, icon: Icon }) => {
            const count = id === "pendencias" ? pendingCount : id === "conflitos" ? conflicts.length : 0;
            return (
              <button
                key={id}
                className={`nav-item ${activeTab === id ? "active" : ""}`}
                id={`tab-${id}`}
                role="tab"
                aria-selected={activeTab === id}
                aria-controls="main-tab-panel"
                onClick={() => selectTab(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {count > 0 && <span className={`nav-badge ${id === "conflitos" ? "nav-badge-warn" : ""}`}>{count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <section className="connection-card" aria-label="Conexão com Google">
          <div className={`connection-dot ${googleConnected ? "connected" : ""}`} />
          <div className="connection-copy">
            <b>{googleConnected ? "Google conectado" : "Conecte sua conta"}</b>
            <small>{dashboard?.google.email || "Gmail"}</small>
          </div>
          {!googleConnected && <button className="connect-link" onClick={connectGoogle}>Conectar</button>}
        </section>
        <div className="profile"><span className="avatar">D</span><span><b>Diego Dias</b><small>Conta pessoal</small></span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
          <span className="topbar-brand">eunom<span>IA</span></span>
          <span className="topbar-context">{TABS.find((tab) => tab.id === activeTab)?.label}</span>
        </header>

        <div className="page" id="main-tab-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          {pageError && <div className="error-banner" role="alert"><AlertTriangle size={17} /><span>{pageError}</span><button className="icon-button" onClick={() => setPageError("")} aria-label="Fechar aviso"><X size={16} /></button></div>}

          {activeTab === "chat" && (
            <section className="chat-page">
              <div className="page-intro">
                <span className="eyebrow">SEU ASSISTENTE PESSOAL</span>
                <h1>O que precisa da sua atenção?</h1>
                <p>Converse sobre seus compromissos ou faça uma varredura nos e-mails.</p>
              </div>

              <section className="panel chat-panel" aria-label="Conversa com a EunomIA">
                <div className="chat-heading">
                  <span className="assistant-icon"><Sparkles size={18} /></span>
                  <div><b>EunomIA</b><small>Assistente pessoal</small></div>
                  <span className={`connection-status ${googleConnected ? "connected" : ""}`}>
                    <i />{googleConnected ? "Google conectado" : "Google desconectado"}
                  </span>
                </div>
                <div className="chat-messages" aria-live="polite">
                  {messages.map((message, index) => (
                    <div className={`chat-message ${message.role}`} key={`${index}-${message.role}`}>
                      {message.role === "assistant" && <span className="message-avatar"><Sparkles size={13} /></span>}
                      <div className="chat-message-content">
                        <p>{message.text}</p>
                        {message.pendingDraft && (
                          <button
                            className="button button-primary event-confirm-button"
                            onClick={() => confirmChatRecord(message.pendingDraft)}
                            disabled={confirmingEventId === message.pendingDraft.record.id}
                          >
                            <Check size={15} />
                            {confirmingEventId === message.pendingDraft.record.id
                              ? "Adicionando..."
                              : `Confirmar ${message.pendingDraft.type === "meeting" ? "Reunião" : "Prazo"}`}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && <div className="typing-indicator"><span /><span /><span /></div>}
                </div>
                <form className="chat-composer" onSubmit={sendMessage}>
                  <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva sua mensagem..." aria-label="Mensagem para a EunomIA" />
                  <button disabled={!draft.trim() || loading} aria-label="Enviar mensagem"><Send size={17} /></button>
                </form>
                <div className="chat-footer">
                  <span><CircleHelp size={13} /> A IA pode cometer erros</span>
                  <button className="scan-button" onClick={() => googleConnected ? setShowScanDialog(true) : connectGoogle()} disabled={syncing}>
                    {syncing ? <RefreshCw className="spin" size={16} /> : <Mail size={16} />}
                    {googleConnected ? "Varrer e-mails" : "Conectar Google"}
                  </button>
                </div>
              </section>

              <section className="panel detected-panel">
                <div className="section-heading">
                  <div><h2>Compromissos encontrados</h2><p>Aceite para adicionar às Pendências ou recuse para descartar.</p></div>
                  <span className="count-pill">{detectedItems.length}</span>
                </div>
                {detectedItems.length ? (
                  <div className="simple-list">
                    {detectedItems.map((item) => {
                      const { record, type } = item;
                      const isMeeting = type === "meeting";
                      const dateSummary = isMeeting
                        ? formatDate(record.starts_at)
                        : record.due_at
                          ? `Prazo ${formatDate(record.due_at)}`
                          : record.deadline_reference || "Prazo não informado";
                      return (
                      <article className="detected-item" key={`${type}-${record.id}`}>
                        <button
                          className="pending-item-detail"
                          onClick={() => setSelectedPending(item)}
                        >
                          <span className={`list-icon ${isMeeting ? "detected-icon" : "task-icon"}`}>
                            {isMeeting ? <CalendarDays size={17} /> : <CheckCheck size={17} />}
                          </span>
                          <span className="list-copy">
                            <b>{record.title}</b>
                            <small>{dateSummary}{isMeeting && record.location ? ` · ${record.location}` : ""}</small>
                            {record.inferred_fields?.length > 0 && (
                              <small className="implicit-info" title={record.inferred_fields.join(" ")}>
                                Informação completada automaticamente: {record.inferred_fields.join(" ")}
                              </small>
                            )}
                          </span>
                          <span className="source-label">{isMeeting ? "Reunião" : "Prazo"} · E-mail</span>
                        </button>
                        <div className="detected-actions">
                          <button
                            className="button button-quiet"
                            onClick={() => editDetected(item)}
                            aria-label={`Editar ${record.title}`}
                          >
                            Editar
                          </button>
                          <button
                            className="button button-soft"
                            onClick={() => reviewDetected(item, "pending")}
                            disabled={reviewingEventId === record.id}
                          >
                            <Check size={15} />Adicionar
                          </button>
                          <button
                            className="icon-button"
                            onClick={() => reviewDetected(item, "rejected")}
                            disabled={reviewingEventId === record.id}
                            aria-label={`Recusar ${record.title}`}
                            title="Recusar compromisso"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </article>
                    )})}
                  </div>
                ) : <EmptyState text={dashboard ? "Nenhum compromisso aguardando revisão." : "Carregando compromissos..."} />}
              </section>
            </section>
          )}

          {activeTab === "pendencias" && (
            <section className="list-page">
              <div className="page-intro">
                <span className="eyebrow">TAREFAS E REUNIÕES PARA REVISAR</span>
                <h1>Pendências</h1>
                <p>O que ainda precisa ser resolvido.</p>
              </div>
              <section className="panel simple-panel">
                <div className="section-heading"><div><h2>Em aberto</h2><p>{pendingCount ? `${pendingCount} ${pendingCount === 1 ? "item" : "itens"}` : "Nenhum item pendente"}</p></div><span className="count-pill">{pendingCount}</span></div>
                {pendingCount ? (
                  <div className="simple-list">
                    {pendingTasks.map((task) => (
                      <article className="task-item" key={task.id}>
                        <button className="task-check" onClick={() => completeTask(task)} aria-label={`Concluir ${task.title}`}><Check size={14} /></button>
                        <button
                          className="pending-item-detail"
                          onClick={() => setSelectedPending({ type: "deadline", record: task })}
                        >
                          <span className="list-copy"><b>{task.title}</b><small>{task.due_at ? `Prazo ${formatDate(task.due_at)}` : task.deadline_reference || (task.source === "email" ? "Identificada em e-mail" : "Sem prazo definido")}{task.responsible ? ` · Responsável: ${task.responsible}` : ""}</small></span>
                          <span className="source-label">{task.source === "email" ? <><Mail size={13} />E-mail</> : "Tarefa"}</span>
                        </button>
                      </article>
                    ))}
                    {pendingMeetings.map((meeting) => (
                      <article className="task-item" key={meeting.id}>
                        <button
                          className="pending-item-detail"
                          onClick={() => setSelectedPending({ type: "meeting", record: meeting })}
                        >
                          <span className="list-icon detected-icon"><CalendarDays size={17} /></span>
                          <span className="list-copy"><b>{meeting.title}</b><small>{formatDate(meeting.starts_at)}</small></span>
                          <span className="source-label">Reunião</span>
                        </button>
                      </article>
                    ))}
                  </div>
                ) : <EmptyState text={dashboard ? "Tudo em dia. Nenhuma pendência aberta." : "Carregando pendências..."} />}
              </section>
            </section>
          )}

          {activeTab === "conflitos" && (
            <section className="list-page">
              <div className="page-intro">
                <span className="eyebrow">HORÁRIOS SOBREPOSTOS</span>
                <h1>Conflitos</h1>
                <p>Revise compromissos que acontecem no mesmo horário.</p>
              </div>
              <section className="panel simple-panel">
                <div className="section-heading"><div><h2>Precisa de atenção</h2><p>{conflicts.length ? `${conflicts.length} ${conflicts.length === 1 ? "conflito" : "conflitos"}` : "Sua agenda está livre de sobreposições"}</p></div><span className="count-pill count-warn">{conflicts.length}</span></div>
                {conflicts.length ? (
                  <div className="simple-list">
                    {conflicts.map((event) => (
                      <article className="conflict-item" key={event.id}>
                        <span className="list-icon conflict-icon"><AlertTriangle size={17} /></span>
                        <span className="list-copy"><b>{event.title}</b><small>{formatDate(event.starts_at)}{event.location ? ` · ${event.location}` : ""}</small></span>
                        <span className="conflict-label">Conflito</span>
                      </article>
                    ))}
                  </div>
                ) : <EmptyState text={dashboard ? "Nenhuma sobreposição identificada." : "Carregando conflitos..."} />}
              </section>
            </section>
          )}
        </div>
      </main>

      {showScanDialog && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowScanDialog(false)}>
          <form className="scan-modal" onSubmit={scanEmails} aria-busy={syncing}>
            <div className="modal-heading">
              <span className="assistant-icon"><Mail size={18} /></span>
              <button type="button" className="icon-button" onClick={() => setShowScanDialog(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <span className="eyebrow">CONTROLE DA VARREDURA</span>
            <h2>Escolha o período dos e-mails</h2>
            <p>A EunomIA vai buscar mensagens nesse intervalo para identificar compromissos. Um período menor ajuda a limitar o processamento.</p>
            <div className="date-fields">
              <label>Desde<input type="date" required max={scanUntil || today} value={scanSince} onChange={(event) => setScanSince(event.target.value)} /></label>
              <label>Até<input type="date" required max={today} min={scanSince} value={scanUntil} onChange={(event) => setScanUntil(event.target.value)} /></label>
            </div>
            {scanSince && scanUntil && scanSince > scanUntil && <p className="form-error">A data inicial deve ser anterior ou igual à data final.</p>}
            {scanError && <p className="form-error" role="alert">{scanError}</p>}
            <div className="modal-actions">
              <button type="button" className="button button-quiet" onClick={() => setShowScanDialog(false)}>Cancelar</button>
              <button className="button button-primary" disabled={syncing || !scanSince || !scanUntil || scanSince > scanUntil}>
                {syncing ? <><RefreshCw className="spin" size={15} />Varrendo...</> : <>Iniciar varredura<ChevronRight size={16} /></>}
              </button>
            </div>
          </form>
        </div>
      )}
      {selectedPending && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && closePendingDetails()}
        >
          <section
            className="scan-modal pending-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-details-title"
          >
            <div className="modal-heading">
              <span className="assistant-icon">
                {selectedPending.type === "meeting" ? <CalendarDays size={18} /> : <CheckCheck size={18} />}
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={closePendingDetails}
                aria-label="Fechar detalhes"
              >
                <X size={18} />
              </button>
            </div>
            {editingDetected && editDraft ? (
              <form className="detected-edit-form" onSubmit={saveDetectedEdit}>
                <span className="eyebrow">
                  {selectedPending.type === "meeting" ? "EDITAR REUNIÃO" : "EDITAR PRAZO"}
                </span>
                <h2 id="pending-details-title">Editar informações</h2>
                <label>
                  Título
                  <input
                    required
                    value={editDraft.title}
                    onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                  />
                </label>
                <label>
                  Descrição
                  <textarea
                    rows={4}
                    value={editDraft.description}
                    onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                  />
                </label>
                {selectedPending.type === "meeting" ? (
                  <>
                    <label>
                      Data e horário de início
                      <input
                        type="datetime-local"
                        required
                        value={editDraft.startsAt}
                        onChange={(event) => setEditDraft({ ...editDraft, startsAt: event.target.value })}
                      />
                    </label>
                    <label>
                      Duração em minutos
                      <input
                        type="number"
                        min="15"
                        required
                        value={editDraft.durationMinutes}
                        onChange={(event) => setEditDraft({ ...editDraft, durationMinutes: event.target.value })}
                      />
                    </label>
                    <label>
                      Local
                      <input
                        value={editDraft.location}
                        onChange={(event) => setEditDraft({ ...editDraft, location: event.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Data e horário do prazo
                      <input
                        type="datetime-local"
                        value={editDraft.dueAt}
                        onChange={(event) => setEditDraft({ ...editDraft, dueAt: event.target.value })}
                      />
                    </label>
                    <label>
                      Referência do prazo
                      <input
                        value={editDraft.deadlineReference}
                        onChange={(event) => setEditDraft({ ...editDraft, deadlineReference: event.target.value })}
                      />
                    </label>
                    <label>
                      Responsável
                      <input
                        value={editDraft.responsible}
                        onChange={(event) => setEditDraft({ ...editDraft, responsible: event.target.value })}
                      />
                    </label>
                  </>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => {
                      setEditingDetected(false);
                      setEditDraft(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button className="button button-primary" disabled={savingDetected}>
                    {savingDetected ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              </form>
            ) : (
              <>
            <span className="eyebrow">{selectedPending.type === "meeting" ? "DETALHES DA REUNIÃO" : "DETALHES DO PRAZO"}</span>
            <h2 id="pending-details-title">{selectedPending.record.title}</h2>
            {selectedPending.record.sender && (
              <p className="pending-description sender-details">
                Enviado por: {selectedPending.record.sender}
              </p>
            )}
            <p className="pending-description">
              {selectedPending.record.description || "Nenhuma descrição informada."}
            </p>
            {selectedPending.record.inferred_fields?.length > 0 && (
              <p className="pending-description implicit-details">
                Informação completada automaticamente: {selectedPending.record.inferred_fields.join(" ")}
              </p>
            )}
            <dl className="pending-details-list">
              {selectedPending.type === "meeting" ? (
                <>
                  <div><dt>Hora de início</dt><dd>{formatDate(selectedPending.record.starts_at)}</dd></div>
                  <div>
                    <dt>Duração</dt>
                    <dd>
                      {formatDuration(
                        selectedPending.record.duration_minutes
                        ?? (selectedPending.record.ends_at
                          ? Math.round(
                              (new Date(selectedPending.record.ends_at).getTime()
                                - new Date(selectedPending.record.starts_at).getTime()) / 60000,
                            )
                          : null),
                      )}
                    </dd>
                  </div>
                  {selectedPending.record.location && (
                    <div><dt>Local</dt><dd>{selectedPending.record.location}</dd></div>
                  )}
                  {selectedPending.record.link && (
                    <div><dt>Link</dt><dd><a href={selectedPending.record.link} target="_blank" rel="noreferrer">{selectedPending.record.link}</a></dd></div>
                  )}
                </>
              ) : (
                <>
                  <div><dt>Prazo</dt><dd>{selectedPending.record.due_at ? formatDate(selectedPending.record.due_at) : selectedPending.record.deadline_reference || "Não informado"}</dd></div>
                  <div><dt>Responsável</dt><dd>{selectedPending.record.responsible || "Não informado"}</dd></div>
                  <div><dt>Duração</dt><dd>Não se aplica a prazos</dd></div>
                  <div><dt>Hora de início</dt><dd>Não se aplica a prazos</dd></div>
                </>
              )}
            </dl>
              </>
            )}
          </section>
        </div>
      )}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state"><span className="empty-state-icon"><CheckCheck size={16} /></span>{text}</div>;
}

export default App;
