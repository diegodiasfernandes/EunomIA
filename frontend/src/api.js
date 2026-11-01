// Cliente da API do EunomIA. Todas as chamadas ao backend passam por aqui.

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  // tipo: 'rede' | 'http' | 'formato' | 'tempo'
  constructor(tipo, mensagem, status) {
    super(mensagem);
    this.tipo = tipo;
    this.status = status;
  }
}

function extrairDetalhe(corpo) {
  if (!corpo || corpo.detail === undefined) return '';
  const d = corpo.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x && x.msg).filter(Boolean).join('; ');
  return '';
}

async function requisicao(caminho, { metodo = 'GET', corpo, limiteMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), limiteMs);
  let resp;
  try {
    resp = await fetch(API_URL + caminho, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new ApiError('tempo', 'A API demorou demais para responder.');
    throw new ApiError('rede', 'Sem conexão com a API.');
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await resp.json();
  } catch (e) {
    json = null;
  }
  if (!resp.ok) throw new ApiError('http', extrairDetalhe(json), resp.status);
  if (json === null || typeof json !== 'object') throw new ApiError('formato', 'A resposta da API não está em JSON.');
  return json;
}

// Mensagem em português para mostrar ao usuário. "acao" completa a frase: "Não foi possível <acao>".
export function mensagemErro(err, acao) {
  if (!(err instanceof ApiError)) return 'Não foi possível ' + acao + '. Tente novamente.';
  if (err.tipo === 'rede')
    return 'Não foi possível ' + acao + ': sem conexão com a API em ' + API_URL + '. Verifique se o backend está em execução e se o CORS permite esta origem.';
  if (err.tipo === 'tempo') return 'Não foi possível ' + acao + ': a API demorou demais para responder.';
  if (err.tipo === 'formato') return 'Não foi possível ' + acao + ': ' + err.message;
  if (err.status >= 500)
    return 'Não foi possível ' + acao + ': a API respondeu com erro interno (' + err.status + ').' + (err.message ? ' ' + err.message : '');
  return 'Não foi possível ' + acao + ' (' + err.status + ').' + (err.message ? ' ' + err.message : '');
}

// ---- Integração Google ----
export async function obterStatusGoogle() {
  const r = await requisicao('/api/integrations/google/status');
  if (typeof r.connected !== 'boolean') throw new ApiError('formato', 'o status devolvido pela API não tem o campo "connected".');
  return r;
}

// A autorização é um redirecionamento do navegador; a API não devolve a URL em JSON.
export const urlAutorizacaoGoogle = () => API_URL + '/api/integrations/google/auth';

export async function sincronizarGoogle(emailSince, emailUntil) {
  const r = await requisicao('/api/integrations/google/sync', {
    metodo: 'POST',
    corpo: { email_since: emailSince, email_until: emailUntil },
    limiteMs: 120000,
  });
  if (!r.result || typeof r.result !== 'object') throw new ApiError('formato', 'a resposta da sincronização não tem o campo "result".');
  return r.result;
}

// ---- Agenda ----
export async function listarEventos() {
  const r = await requisicao('/api/events');
  const lista = Array.isArray(r) ? r : r.events;
  if (!Array.isArray(lista)) throw new ApiError('formato', 'a resposta da API não contém a lista "events".');
  return lista;
}
