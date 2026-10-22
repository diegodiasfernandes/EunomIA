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

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  const [syncing, setSyncing] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanSince, setScanSince] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return localDateValue(date);
  });
  const [scanUntil, setScanUntil] = useState(() => localDateValue(new Date()));
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    setPageError("");
    try {
      const result = await api("/api/integrations/google/sync", {
        method: "POST",
        body: JSON.stringify({ email_since: scanSince, email_until: scanUntil }),
      });
      await refresh();
      setShowScanDialog(false);
      setToast(`Varredura concluída: ${result.result.emails} e-mails e ${result.result.email_threads_with_events} possíveis compromissos.`);
    } catch (error) {
      setPageError(error.message);
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
          eventDraft: response.action === "event_confirmation_required" ? response.event : null,
        },
      ]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: `Não consegui concluir: ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmChatEvent(eventDraft) {
    setConfirmingEventId(eventDraft.id);
    try {
      await api("/api/events", {
        method: "POST",
        body: JSON.stringify(eventDraft),
      });
      await refresh();
      setMessages((current) => current.map((message) => (
        message.eventDraft?.id === eventDraft.id
          ? { ...message, eventDraft: null, text: "Reunião adicionada às Pendências." }
          : message
      )));
      setToast("Reunião adicionada às Pendências.");
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

  async function confirmDetected(event) {
    try {
      await api(`/api/events/${event.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
      await refresh();
      setToast("Compromisso confirmado na agenda conectada.");
    } catch (error) {
      setPageError(error.message);
    }
  }

  const detectedEvents = events.filter((event) => event.status === "detected" && event.source === "email");
  const conflicts = events.filter((event) => event.conflict);
  const pendingTasks = dashboard?.tasks || [];
  const pendingMeetings = events.filter((event) => event.status === "detected");
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
            <small>{dashboard?.google.email || "Gmail e Google Calendar"}</small>
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
                        {message.eventDraft && (
                          <button
                            className="button button-primary event-confirm-button"
                            onClick={() => confirmChatEvent(message.eventDraft)}
                            disabled={confirmingEventId === message.eventDraft.id}
                          >
                            <Check size={15} />
                            {confirmingEventId === message.eventDraft.id ? "Adicionando..." : "Confirmar Reunião"}
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
                  <div><h2>Compromissos encontrados</h2><p>Revise antes de adicionar à sua agenda conectada.</p></div>
                  <span className="count-pill">{detectedEvents.length}</span>
                </div>
                {detectedEvents.length ? (
                  <div className="simple-list">
                    {detectedEvents.map((event) => (
                      <article className="detected-item" key={event.id}>
                        <span className="list-icon detected-icon"><CalendarDays size={17} /></span>
                        <span className="list-copy"><b>{event.title}</b><small>{formatDate(event.starts_at)}{event.location ? ` · ${event.location}` : ""}</small></span>
                        <button className="button button-soft" onClick={() => confirmDetected(event)}><Check size={15} />Adicionar</button>
                      </article>
                    ))}
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
                        <span className="list-copy"><b>{task.title}</b><small>{task.due_at ? `Prazo ${formatDate(task.due_at)}` : "Identificada em e-mail"}</small></span>
                        <span className="source-label"><Mail size={13} />E-mail</span>
                      </article>
                    ))}
                    {pendingMeetings.map((meeting) => (
                      <article className="task-item" key={meeting.id}>
                        <span className="list-icon detected-icon"><CalendarDays size={17} /></span>
                        <span className="list-copy"><b>{meeting.title}</b><small>{formatDate(meeting.starts_at)}</small></span>
                        <span className="source-label">Reunião</span>
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
          <form className="scan-modal" onSubmit={scanEmails}>
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
            <div className="modal-actions">
              <button type="button" className="button button-quiet" onClick={() => setShowScanDialog(false)}>Cancelar</button>
              <button className="button button-primary" disabled={syncing || !scanSince || !scanUntil || scanSince > scanUntil}>
                {syncing ? <><RefreshCw className="spin" size={15} />Varrendo...</> : <>Iniciar varredura<ChevronRight size={16} /></>}
              </button>
            </div>
          </form>
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
