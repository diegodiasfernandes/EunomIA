// Conversão dos registros de GET /api/events para o formato interno da tela Minha Agenda.
//
// ATENÇÃO: o contrato descreve os campos (identificador, título, início, término, descrição,
// status, origem, local e conflitos), mas não os nomes exatos. Os nomes abaixo são SUPOSIÇÕES
// e ficam todos neste objeto. Quando houver acesso ao backend/app/models.py, ajuste só CAMPOS
// (e, se preciso, normalizarStatus / normalizarConflitos).
export const CAMPOS = {
  id: ['id', 'event_id', 'uuid'],
  titulo: ['title', 'titulo', 'summary'],
  inicio: ['start', 'start_at', 'start_time', 'starts_at', 'start_datetime'],
  fim: ['end', 'end_at', 'end_time', 'ends_at', 'end_datetime'],
  descricao: ['description', 'descricao'],
  status: ['status'],
  origem: ['source', 'origin', 'origem'],
  local: ['location', 'local'],
  conflitos: ['conflicts', 'conflict_with', 'conflicts_with', 'conflitos'],
};

const pad = (n) => String(n).padStart(2, '0');
const diaLocal = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const horaLocal = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());

const pegar = (r, nomes) => {
  for (const n of nomes) if (r[n] !== undefined && r[n] !== null) return r[n];
  return undefined;
};

// Datas com fuso viram horário local do navegador. "YYYY-MM-DD" sem hora é tratado como dia inteiro.
function lerData(v) {
  if (typeof v !== 'string' || !v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { diaTodo: true, d: new Date(v + 'T00:00:00') };
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : { diaTodo: false, d };
}

// Valores de status esperados são desconhecidos: cancelado e pendente são reconhecidos por trecho.
export function normalizarStatus(s) {
  const t = String(s == null ? '' : s).toLowerCase();
  if (t.includes('cancel')) return 'canceled';
  if (t.includes('pend') || t.includes('review') || t.includes('revis')) return 'pending';
  return 'confirmed';
}

// Devolve lista de textos (ids ou títulos), ou null quando a API não informou conflitos.
export function normalizarConflitos(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? ['outro compromisso'] : [];
  if (!Array.isArray(v)) return null;
  return v
    .map((x) => {
      if (typeof x === 'string' || typeof x === 'number') return String(x);
      if (x && typeof x === 'object') return String(x.title ?? x.titulo ?? x.summary ?? x.id ?? '');
      return '';
    })
    .filter(Boolean);
}

export function normalizarEvento(r) {
  if (!r || typeof r !== 'object') return null;
  const ini = lerData(pegar(r, CAMPOS.inicio));
  const id = pegar(r, CAMPOS.id);
  if (!ini || id === undefined) return null;
  const fim = lerData(pegar(r, CAMPOS.fim));

  let a = '';
  let b = '';
  let bc = '';
  if (!ini.diaTodo) {
    a = horaLocal(ini.d);
    if (fim && !fim.diaTodo) {
      b = horaLocal(fim.d);
      bc = diaLocal(fim.d) > diaLocal(ini.d) ? '23:59' : b;
    } else {
      b = a;
      bc = a;
    }
  }
  const origem = pegar(r, CAMPOS.origem);
  return {
    id: String(id),
    k: diaLocal(ini.d),
    a,
    b,
    bc,
    t: String(pegar(r, CAMPOS.titulo) || '(sem título)'),
    l: pegar(r, CAMPOS.local) || '',
    desc: pegar(r, CAMPOS.descricao) || '',
    st: normalizarStatus(pegar(r, CAMPOS.status)),
    o: [origem ? String(origem) : 'EunomIA'],
    c: normalizarConflitos(pegar(r, CAMPOS.conflitos)),
  };
}

// Converte a lista inteira. Registros sem id ou sem data válida são descartados e contados.
export function normalizarLista(brutos) {
  const eventos = brutos.map(normalizarEvento).filter(Boolean);
  const porId = {};
  eventos.forEach((e) => {
    porId[e.id] = e.t;
  });
  // Se a API devolver ids de outros eventos na lista de conflitos, troca pelo título.
  eventos.forEach((e) => {
    if (e.c) e.c = e.c.map((x) => porId[x] || x);
  });
  return { eventos, descartados: brutos.length - eventos.length };
}
