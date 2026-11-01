import React, { useState, useEffect } from 'react';
import { listarEventos, obterStatusGoogle, sincronizarGoogle, urlAutorizacaoGoogle, mensagemErro } from './api.js';
import { normalizarLista } from './eventos.js';

const P={
home:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
cal:'<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
layers:'<path d="m12 2 10 5-10 5L2 7z"/><path d="m22 17-10 5-10-5M22 12l-10 5-10-5"/>',
mail:'<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/>',
task:'<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0"/>',
x:'<path d="M18 6 6 18M6 6l12 12"/>',
send:'<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
zap:'<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
spark:'<path d="M9.9 3.5 11 8l4.5 1.1L11 10.2 9.9 14.7 8.8 10.2 4.3 9.1 8.8 8z"/><path d="M18 14v4M16 16h4"/>',
plus:'<path d="M5 12h14M12 5v14"/>',
check:'<path d="M20 6 9 17l-5-5"/>',
chev:'<path d="m9 18 6-6-6-6"/>',
alert:'<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3zM12 9v4M12 17h.01"/>',
menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
coffee:'<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/>',
ban:'<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
archive:'<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
trash:'<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
reply:'<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
video:'<path d="m22 8-6 4 6 4z"/><rect width="14" height="12" x="2" y="6" rx="2"/>',
refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'
};
const I=({n,s=20,c='',w=2})=><svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={c} dangerouslySetInnerHTML={{__html:P[n]}}/>;

const card="bg-white rounded-3xl border border-slate-100 shadow-sm";
const btnP="px-5 py-2.5 bg-[#3D1534] text-white rounded-full text-sm font-bold hover:bg-[#2A0E24] transition-colors";
const btnS="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-full text-sm font-bold hover:bg-slate-50 transition-colors";

const NAV=[['hoje','Hoje','home'],['agenda','Minha Agenda','cal'],['revisar','Para Revisar','layers','3'],['emails','E-mails','mail'],['tarefas','Tarefas','task']];
const SYS=[['historico','Histórico','clock'],['regras','Regras','sliders'],['configs','Configurações','gear']];

function Logo(){return(
<div className="flex items-center gap-3">
  <div className="relative w-10 h-10 bg-[#3D1534] rounded-[10px] flex items-center justify-center shadow-sm">
    <div className="flex gap-1 absolute top-1.5"><i className="w-2 h-[2px] rounded-full bg-[#C29352]"/><i className="w-2 h-[2px] rounded-full bg-[#C29352]"/></div>
    <span className="text-white font-bold text-2xl mt-1.5 leading-none">E</span>
    <div className="absolute -bottom-1 -right-1 text-[#C29352] bg-white rounded-tl-md p-[1px] shadow-sm"><I n="check" s={14} w={4}/></div>
  </div>
  <span className="font-extrabold text-2xl tracking-tight"><span className="text-[#3D1534]">Eunom</span><span className="text-[#C29352]">IA</span></span>
</div>)}

function NavItem({id,label,icon,badge,cur,go}){const a=cur===id;return(
<button onClick={()=>go(id)} className={`flex items-center justify-between px-4 py-3 rounded-full text-sm font-bold transition-all mx-2 w-[calc(100%-1rem)] ${a?'bg-[#3E4B8E]/10 text-[#3E4B8E]':'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
  <span className="flex items-center gap-4"><I n={icon} c={a?'text-[#3E4B8E]':'text-slate-400'}/>{label}</span>
  {badge&&<span className="bg-[#3D1534] text-[#C29352] text-[11px] py-1 px-2.5 rounded-full font-extrabold">{badge}</span>}
</button>)}

function Head({t,sub,children}){return(
<div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
  <div><h1 className="text-3xl font-extrabold text-[#3D1534] tracking-tight">{t}</h1>{sub&&<p className="text-slate-500 mt-2 font-medium">{sub}</p>}</div>
  <div className="flex gap-2 flex-wrap">{children}</div>
</div>)}

function Metric({t,v,s,icon,k,active}){
const th={blue:['bg-[#3E4B8E]/5','text-[#3E4B8E]','bg-[#3E4B8E]','text-white'],bronze:['bg-[#FFF4EB]','text-[#3D1534]','bg-[#C29352]','text-white'],slate:['bg-white','text-[#3D1534]','bg-slate-100','text-slate-500'],rose:['bg-rose-50','text-rose-700','bg-rose-100','text-rose-600']}[k];
return(<div className={`${th[0]} p-6 rounded-3xl border ${active?'border-[#C29352]/40 shadow-md ring-2 ring-[#C29352]/10':'border-slate-100 shadow-sm'}`}>
  <div className="flex items-center justify-between mb-4"><p className="text-sm font-bold text-slate-500">{t}</p><div className={`w-10 h-10 rounded-full ${th[2]} ${th[3]} flex items-center justify-center`}><I n={icon} s={22}/></div></div>
  <h3 className={`text-4xl font-extrabold ${th[1]} tracking-tight`}>{v}</h3><p className="text-sm text-slate-500 font-medium">{s}</p></div>)}

function Obs({obs,title,desc}){
const [note,setNote]=useState(obs||'');const [edit,setEdit]=useState(false);const [draft,setDraft]=useState('');
if(edit)return(<div className="mt-4"><textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={4} placeholder="Como foi? Decisões, pendências e próximos passos" className="w-full text-sm text-slate-800 rounded-xl border border-slate-200 p-3 focus:border-[#3E4B8E] focus:ring-2 focus:ring-[#3E4B8E]/20"/>
  <div className="flex gap-2 mt-2 flex-wrap items-center"><button onClick={()=>{setNote(draft.trim());setEdit(false)}} className={btnP+' !py-2'}>Salvar observação</button><button onClick={()=>setEdit(false)} className={btnS+' !py-2'}>Cancelar</button>
  <button onClick={()=>setDraft(title+' ('+desc+')\n• Assuntos tratados: \n• Dúvidas e decisões: \n• Pendências e prazos: ')} className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-[#C29352] hover:bg-[#FFF4EB] px-3 py-2 rounded-full"><I n="zap" s={14}/>Gerar rascunho</button></div></div>);
if(note)return(<div className="mt-4 bg-[#FFF4EB] border border-[#C29352]/30 rounded-xl p-4"><div className="flex items-center justify-between mb-1"><p className="text-xs font-bold text-[#3D1534]">Como foi</p><button onClick={()=>{setDraft(note);setEdit(true)}} className="text-xs font-bold text-[#3E4B8E] hover:underline">Editar</button></div><p className="text-sm text-slate-700 whitespace-pre-line">{note}</p></div>);
return(<button onClick={()=>{setDraft('');setEdit(true)}} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#3E4B8E] hover:bg-[#3E4B8E]/5 px-3 py-1.5 -ml-3 rounded-full"><I n="plus" s={14}/>Adicionar observação</button>)}

function TL({time,title,desc,st,icon,last,obs}){
const cur=st==='current',past=st==='past'||st==='canceled',cf=st==='conflict';
const dot=cur?'bg-white border-[4px] border-[#3E4B8E] ring-4 ring-[#3E4B8E]/20 w-4 h-4':cf?'bg-white border-[4px] border-rose-500 ring-4 ring-rose-500/20 w-4 h-4':past?'bg-slate-300 w-3 h-3':'bg-white border-2 border-slate-300 w-3 h-3';
const cd=cur?'bg-white border border-slate-200/50 border-l-[6px] border-l-[#3E4B8E] shadow-lg shadow-[#3E4B8E]/5':cf?'bg-rose-50 border border-rose-200/60 border-l-[6px] border-l-rose-500':past?'bg-slate-50/75 border border-slate-100 opacity-80':'bg-white border border-slate-100';
return(<div className="flex">
  <div className={`w-16 pt-5 text-right text-sm flex-shrink-0 ${cur?'font-bold text-[#3E4B8E]':cf?'font-bold text-rose-600':'font-medium text-slate-400'}`}>{time}</div>
  <div className="w-12 flex flex-col items-center relative flex-shrink-0">
    <div className={`rounded-full mt-6 z-10 relative ${dot}`}>{(cur||cf)&&<span className={`absolute inset-0 rounded-full animate-ping opacity-20 scale-150 ${cur?'bg-[#3E4B8E]':'bg-rose-500'}`}/>}</div>
    {!last&&<div className={`w-px absolute top-8 bottom-0 -mb-8 ${past?'bg-slate-300':cf?'bg-rose-300':'bg-slate-200'}`}/>}
  </div>
  <div className={`flex-1 ${last?'pb-2':'pb-8'}`}><div className={`p-5 rounded-2xl ${cd}`}>
    {cur&&<span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#3E4B8E]/10 text-[#3E4B8E] text-[11px] font-extrabold rounded-md mb-3"><I n="zap" s={12}/>Em breve</span>}
    {cf&&<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-100 text-rose-700 text-[11px] font-extrabold rounded-md mb-3"><I n="alert" s={12}/>Conflito de horário</span>}
    {st==='canceled'&&<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-200/70 text-slate-500 text-[11px] font-extrabold rounded-md mb-3"><I n="ban" s={12}/>Cancelado</span>}
    <p className={`font-bold flex items-center gap-2 mb-1 ${cur?'text-[#3D1534]':cf?'text-rose-900':st==='canceled'?'text-slate-500 line-through':'text-slate-800'}`}>{icon&&<I n={icon} s={18} c="text-[#C29352]"/>}{title}</p>
    <p className={`text-sm font-medium ${cf?'text-rose-700':'text-slate-500'}`}>{desc}</p>
    {st==='past'&&<Obs obs={obs} title={title} desc={desc}/>}
  </div></div></div>)}

function Approval({title,date,src,onDone}){return(
<div className="p-5 bg-white border border-[#C29352]/20 rounded-3xl shadow-sm hover:border-[#C29352]/40 transition-colors">
  <div className="flex justify-between items-start mb-3"><div className="w-10 h-10 rounded-full bg-[#FFF4EB] text-[#C29352] flex items-center justify-center"><I n="zap" s={18}/></div><span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">{src}</span></div>
  <p className="font-extrabold text-[#3D1534] leading-tight mb-2">{title}</p>
  <div className="bg-slate-50 rounded-xl p-3 mb-4 flex items-center gap-3 border border-slate-100"><I n="cal" s={18} c="text-slate-400"/><p className="text-xs font-bold text-slate-600">{date}</p></div>
  <div className="flex gap-2"><button onClick={onDone} className="flex-1 py-2.5 bg-[#3D1534] text-white rounded-xl text-sm font-bold hover:bg-[#2A0E24]">Aprovar</button><button onClick={onDone} aria-label="Ignorar" className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"><I n="x" s={18}/></button></div>
</div>)}

const SUG=[
{id:1,title:'Estudo em grupo — Compiladores',date:'Hoje • 12:30 - 14:00',src:'Via WhatsApp'},
{id:2,title:'Plantão de Estruturas de Dados',date:'Ter, 03/11 • 14:00 - 16:00',src:'Via e-mail'},
{id:3,title:'Prova de Banco de Dados',date:'Qui, 05/11 • 07:30',src:'Via e-mail'}];

function Empty({t,d}){return(<div className="text-center py-16"><div className="w-14 h-14 mx-auto rounded-full bg-[#FFF4EB] text-[#C29352] flex items-center justify-center mb-4"><I n="check" s={26}/></div><p className="font-bold text-[#3D1534]">{t}</p><p className="text-sm text-slate-500 mt-1">{d}</p></div>)}

function Hoje({go}){const [sug,setSug]=useState(SUG.slice(0,2));return(
<div className="p-6 lg:p-10 max-w-7xl mx-auto">
  <Head t="Bom dia, Marcos." sub={<>Você tem <strong className="text-[#3E4B8E]">{sug.length} aprovações pendentes</strong> e 5 compromissos hoje.</>}>
    <span className="inline-flex items-center gap-2 text-sm font-bold text-[#3D1534] bg-white px-5 py-2.5 rounded-full border border-slate-200/60 shadow-sm"><I n="cal" s={18} c="text-[#C29352]"/>Sábado, 31 de outubro</span>
  </Head>
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-10">
    <Metric t="Agenda" v="5" s="compromissos hoje" icon="cal" k="blue"/>
    <Metric t="Revisão" v={sug.length} s="sugestões da IA" icon="layers" k="bronze" active/>
    <Metric t="Tarefas" v="4" s="para concluir" icon="task" k="slate"/>
    <Metric t="Conflitos" v="1" s="choque de horário" icon="alert" k="rose"/>
  </div>
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
    <section className={`lg:col-span-8 p-6 lg:p-8 ${card}`}>
      <div className="flex items-center justify-between mb-8"><h2 className="text-xl font-bold text-[#3D1534]">Sua agenda</h2><button onClick={()=>go('agenda')} className="text-sm font-bold text-[#3E4B8E] hover:bg-[#3E4B8E]/5 px-4 py-2 rounded-full flex items-center gap-1">Ver calendário<I n="chev" s={16}/></button></div>
      <TL time="08:00" title="Treino de maratona de programação" desc="Laboratório 03 • Bloco de Informática" st="past" icon="task"/>
      <TL time="09:30" title="Monitoria de Estruturas de Dados" desc="Sala 12 • Bloco B" st="past" obs={'Dúvidas sobre rotações em árvore AVL.\nPendente: lista 4 ainda sem gabarito.'}/>
      <TL time="11:30" title="Reposição de Redes de Computadores" desc="O professor cancelou a reposição." st="canceled"/>
      <TL time="12:00" title="Reunião do TCC com o orientador" desc="Google Meet • capítulo de metodologia" st="current" icon="video"/>
      <TL time="12:30" title="Estudo em grupo — Compiladores" desc="Biblioteca Central • Campus do Itaperi" st="conflict"/>
      <TL time="16:00" title="Revisão de código — Engenharia de Software" desc="Laboratório 02 • projeto da disciplina" last/>
    </section>
    <section className="lg:col-span-4">
      <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold text-[#3D1534]">Aprovações</h2><button onClick={()=>go('revisar')} className="text-sm font-bold text-[#3E4B8E]">Ver todas</button></div>
      <div className="space-y-4">{sug.map(s=><Approval key={s.id} {...s} onDone={()=>setSug(sug.filter(x=>x.id!==s.id))}/>)}{!sug.length&&<div className={card}><Empty t="Nada para aprovar" d="Novas sugestões aparecem aqui."/></div>}</div>
    </section>
  </div>
</div>)}


const pad=n=>String(n).padStart(2,'0');
const key=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const inicioDia=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const horaDe=d=>pad(d.getHours())+':'+pad(d.getMinutes());
const MES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const SEM=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const ROTULOS_ORIGEM={google:'Google',gmail:'Gmail',email:'E-mail',whatsapp:'WhatsApp',manual:'Manual'};
const rotuloOrigem=o=>ROTULOS_ORIGEM[String(o).toLowerCase()]||String(o);
const CORES_ORIGEM=['#3E4B8E','#C29352','#3D1534','#64748B'];
const corOrigem=o=>CORES_ORIGEM[[...String(o)].reduce((s,c)=>s+c.charCodeAt(0),0)%CORES_ORIGEM.length];
const passado=(e,now)=>e.k<key(now)||(e.k===key(now)&&e.bc&&e.bc<=horaDe(now));
// Conflitos: usa a informação da API quando ela existir; senão calcula pela sobreposição de horários.
const conflitos=l=>{const r={};const v=l.filter(e=>e.a&&e.st!=='canceled');
if(l.some(e=>e.c!==null)){l.forEach(e=>{if(e.c&&e.c.length)r[e.id]=e.c});return r}
v.forEach(x=>v.forEach(y=>{if(x!==y&&x.k===y.k&&x.a<y.bc&&y.a<x.bc)(r[x.id]=r[x.id]||[]).push(y.t)}));return r};
const Origem=({id})=><span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600"><i className="w-2 h-2 rounded-full" style={{background:corOrigem(id)}}/>{rotuloOrigem(id)}</span>;
const Ev=({e,cf,open,mini,now})=>{const c=cf[e.id],cn=e.st==='canceled';return(
<button onClick={()=>open(e)} className={`w-full text-left rounded-2xl p-3 border transition-colors ${c?'bg-rose-50 border-rose-200':'bg-white border-slate-100 hover:border-slate-300'} ${passado(e,now)||cn?'opacity-70':''}`}>
  <span className="flex items-center gap-2 flex-wrap text-xs font-bold text-slate-500">{e.a?e.a+' - '+e.b:'Dia todo'}{c&&<span className="inline-flex items-center gap-1 text-rose-700"><I n="alert" s={12}/>Conflito</span>}{cn&&<span className="inline-flex items-center gap-1 text-slate-500"><I n="ban" s={12}/>Cancelado</span>}{e.st==='pending'&&<span className="inline-flex items-center gap-1 text-amber-700"><I n="alert" s={12}/>Pendente</span>}</span>
  <span className={`block text-sm font-bold leading-snug ${cn?'text-slate-500 line-through':'text-[#3D1534]'}`}>{e.t}</span>
  {!mini&&<span className="flex gap-2 mt-1.5 flex-wrap">{e.o.map(o=><Origem key={o} id={o}/>)}</span>}
</button>)};

function Agenda({go,ask}){
const [vw,setVw]=useState('semana'),[now,setNow]=useState(()=>new Date()),[ref,setRef]=useState(()=>inicioDia(new Date())),[off,setOff]=useState([]),[sel,setSel]=useState(null);
const [est,setEst]=useState({s:'loading',evs:[],desc:0,err:null});
const carregar=React.useCallback(()=>{setEst(p=>({...p,s:'loading',err:null}));
  listarEventos().then(r=>{const n=normalizarLista(r);setEst({s:'ok',evs:n.eventos,desc:n.descartados,err:null})}).catch(err=>setEst(p=>({...p,s:'erro',err})))},[]);
useEffect(()=>{carregar()},[carregar]);
useEffect(()=>{const t=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(t)},[]);
const HOJE=inicioDia(now);
const todos=est.evs;
const origens=[...new Set(todos.flatMap(e=>e.o))];
const evs=todos.filter(e=>e.o.some(x=>!off.includes(x))).sort((x,y)=>(x.k+x.a).localeCompare(y.k+y.a));
const cf=conflitos(evs),nc=Object.keys(cf).length,dia=k=>evs.filter(e=>e.k===k);
const nav=n=>setRef(vw==='mes'?new Date(ref.getFullYear(),ref.getMonth()+n,1):addD(ref,n*(vw==='dia'?1:vw==='semana'?7:14)));
const seg=addD(ref,-((ref.getDay()+6)%7));
const dn=d=>d.getDate()+' de '+MES[d.getMonth()];
const rot={dia:SEM[ref.getDay()]+', '+dn(ref),semana:dn(seg)+' a '+dn(addD(seg,6)),mes:MES[ref.getMonth()]+' de '+ref.getFullYear(),lista:'A partir de '+dn(ref)}[vw];
const abrir=d=>{setRef(d);setVw('dia')};
const sem=Array.from({length:7},(_,i)=>addD(seg,i));
const prim=new Date(ref.getFullYear(),ref.getMonth(),1),ini=addD(prim,-((prim.getDay()+6)%7));
const lista=Array.from({length:30},(_,i)=>addD(ref,i)).filter(d=>dia(key(d)).length);
const Vazio=est.s==='ok'?<p className="text-sm text-slate-500 py-6 text-center">Nenhum compromisso neste período.</p>:null;
return(
<div className="p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto">
  <Head t="Minha agenda" sub={rot}>
    <div role="tablist" aria-label="Visualização" className="inline-flex bg-white rounded-full border border-slate-200 p-1">{[['dia','Dia'],['semana','Semana'],['mes','Mês'],['lista','Lista']].map(([k,l])=><button key={k} role="tab" aria-selected={vw===k} onClick={()=>setVw(k)} className={`px-4 py-2 rounded-full text-sm font-bold ${vw===k?'bg-[#3D1534] text-white':'text-slate-600 hover:bg-slate-100'}`}>{l}</button>)}</div>
  </Head>
  <div className="flex flex-wrap items-center gap-2 mb-4">
    <button onClick={()=>nav(-1)} aria-label="Período anterior" className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100"><I n="chev" c="rotate-180"/></button>
    <button onClick={()=>setRef(HOJE)} className={btnS+' !py-2'}>Hoje</button>
    <button onClick={()=>nav(1)} aria-label="Próximo período" className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100"><I n="chev"/></button>
    <span className="w-px h-6 bg-slate-200 mx-1 hidden sm:block"/>
    {origens.length>1&&origens.map(o=>{const on=!off.includes(o);return <button key={o} aria-pressed={on} onClick={()=>setOff(on?[...off,o]:off.filter(x=>x!==o))} className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border ${on?'bg-[#3E4B8E]/10 border-[#3E4B8E]/30 text-[#3E4B8E]':'bg-white border-slate-200 text-slate-400'}`}><i className="w-2.5 h-2.5 rounded-full" style={{background:corOrigem(o)}}/>{rotuloOrigem(o)}{on&&<I n="check" s={14}/>}</button>})}
    <button onClick={carregar} disabled={est.s==='loading'} className={btnS+' !py-2 flex items-center gap-2 disabled:opacity-50'}><I n="refresh" s={16}/>Atualizar</button>
    <button onClick={()=>go('configs')} className="text-sm font-bold text-[#3E4B8E] px-3 py-2 rounded-full hover:bg-[#3E4B8E]/5">Integrações</button>
  </div>
  <p className="text-xs text-slate-500 mb-4">Mostrando a agenda local do EunomIA, não todos os eventos do Google Calendar.</p>
  {est.s==='loading'&&<p role="status" aria-live="polite" className="text-sm font-semibold text-slate-500 mb-4">Carregando compromissos…</p>}
  {est.s==='erro'&&<div role="alert" className="flex flex-wrap items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-5 text-sm text-rose-800"><I n="alert" s={18}/><span className="flex-1 font-semibold">{mensagemErro(est.err,'carregar a agenda')}</span><button onClick={carregar} className="font-bold underline">Tentar novamente</button></div>}
  {est.s==='ok'&&est.desc>0&&<p role="status" className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">{est.desc} {est.desc===1?'registro foi ignorado':'registros foram ignorados'} por não ter identificador ou data de início válidos.</p>}
  {est.s==='ok'&&!todos.length&&<p className="text-sm text-slate-500 mb-4">A agenda local do EunomIA ainda não tem compromissos.</p>}
  {nc>0&&<div role="status" className="flex flex-wrap items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-5 text-sm text-rose-800"><I n="alert" s={18}/><span className="flex-1 font-semibold">{nc} compromissos com horários sobrepostos.</span><button onClick={()=>ask('Me ajude a resolver os conflitos da minha agenda')} className="font-bold underline">Pedir ajuda à EunomIA</button></div>}
  {vw==='dia'&&<div className={`${card} p-4 sm:p-6 space-y-3 max-w-2xl`}>{dia(key(ref)).map(e=><Ev key={e.id} e={e} cf={cf} open={setSel} now={now}/>)}{!dia(key(ref)).length&&Vazio}</div>}
  {vw==='semana'&&<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">{sem.map(d=>{const h=key(d)===key(HOJE);return(
    <section key={key(d)} aria-label={SEM[d.getDay()]+' '+dn(d)} className={`${card} p-3 min-h-[120px] lg:min-h-[320px] ${h?'ring-2 ring-[#C29352]/40 border-[#C29352]/40':''}`}>
      <button onClick={()=>abrir(d)} className="flex items-center justify-between w-full mb-3 text-left"><span className={`text-sm font-extrabold ${h?'text-[#3D1534]':'text-slate-500'}`}>{SEM[d.getDay()].slice(0,3)} {d.getDate()}</span>{h&&<span className="text-[11px] font-bold bg-[#3D1534] text-[#C29352] px-2.5 py-0.5 rounded-full">Hoje</span>}</button>
      <div className="space-y-2">{dia(key(d)).map(e=><Ev key={e.id} e={e} cf={cf} open={setSel} now={now} mini/>)}</div></section>)})}</div>}
  {vw==='mes'&&<div className={`${card} p-2 sm:p-4`}><div className="grid grid-cols-7 text-center text-xs font-bold text-slate-400 mb-2">{['seg','ter','qua','qui','sex','sáb','dom'].map(x=><span key={x}>{x}</span>)}</div>
    <div className="grid grid-cols-7 gap-1">{Array.from({length:42},(_,i)=>{const d=addD(ini,i),l=dia(key(d)),h=key(d)===key(HOJE),c=l.some(e=>cf[e.id]);return(
      <button key={i} onClick={()=>abrir(d)} aria-label={dn(d)+', '+l.length+' compromissos'+(c?', com conflito':'')} className={`min-h-[64px] sm:min-h-[96px] rounded-xl p-1.5 text-left border ${d.getMonth()===ref.getMonth()?'bg-white':'bg-slate-50 text-slate-400'} ${h?'border-[#C29352] ring-1 ring-[#C29352]/40':'border-slate-100 hover:border-slate-300'}`}>
        <span className="flex items-center justify-between"><span className={`text-xs font-bold ${h?'text-[#C29352]':''}`}>{d.getDate()}</span>{c&&<I n="alert" s={12} c="text-rose-500"/>}</span>
        {l.slice(0,2).map(e=><span key={e.id} className="hidden sm:block truncate text-[11px] font-semibold text-[#3E4B8E] bg-[#3E4B8E]/10 rounded px-1 mt-1">{e.t}</span>)}
        {l.length>0&&<span className="block text-[11px] font-bold text-slate-500 mt-1 sm:hidden">{l.length}</span>}{l.length>2&&<span className="hidden sm:block text-[11px] text-slate-500 mt-1">+{l.length-2}</span>}</button>)})}</div></div>}
  {vw==='lista'&&<div className="space-y-5 max-w-3xl">{lista.map(d=><section key={key(d)}><h2 className="text-sm font-extrabold text-[#3D1534] mb-2 capitalize">{SEM[d.getDay()]}, {dn(d)}</h2><div className="space-y-2">{dia(key(d)).map(e=><Ev key={e.id} e={e} cf={cf} open={setSel} now={now}/>)}</div></section>)}{!lista.length&&Vazio}</div>}
  {sel&&<Detalhe e={sel} cf={cf} now={now} fechar={()=>setSel(null)} ask={t=>{setSel(null);ask(t)}}/>}
</div>)}

function Detalhe({e,cf,now,fechar,ask}){const d=new Date(e.k+'T12:00:00');return(
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/30" onClick={fechar} onKeyDown={x=>x.key==='Escape'&&fechar()}>
  <div role="dialog" aria-modal="true" aria-label={e.t} onClick={x=>x.stopPropagation()} className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-slate-500">{SEM[d.getDay()]}, {d.getDate()} de {MES[d.getMonth()]}</p><h2 className={`text-xl font-extrabold leading-tight mt-1 ${e.st==='canceled'?'text-slate-500 line-through':'text-[#3D1534]'}`}>{e.t}</h2></div><button autoFocus onClick={fechar} aria-label="Fechar detalhes" className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0"><I n="x"/></button></div>
    <dl className="mt-4 space-y-3 text-sm">
      <div className="flex gap-3"><I n="clock" s={18} c="text-[#C29352] mt-0.5"/><dd className="font-semibold text-slate-700">{e.a?(e.b&&e.b!==e.a?e.a+' às '+e.b:e.a):'Dia todo'}</dd></div>
      {e.l&&<div className="flex gap-3"><I n="home" s={18} c="text-[#C29352] mt-0.5"/><dd className="font-semibold text-slate-700">{e.l}</dd></div>}
      <div className="flex gap-3"><I n="cal" s={18} c="text-[#C29352] mt-0.5"/><dd className="space-y-1">{e.o.map(o=><span key={o} className="block font-semibold text-slate-700">Origem: {rotuloOrigem(o)}</span>)}</dd></div>
      {e.desc&&<div className="flex gap-3"><I n="menu" s={18} c="text-[#C29352] mt-0.5"/><dd className="font-medium text-slate-700 whitespace-pre-line">{e.desc}</dd></div>}
    </dl>
    {e.st==='pending'&&<p className="mt-4 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2"><I n="alert" s={18} c="flex-shrink-0"/>Este compromisso está pendente de revisão.</p>}
    {e.st==='canceled'&&<p className="mt-4 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl p-3 flex gap-2"><I n="ban" s={18} c="flex-shrink-0"/>Este compromisso foi cancelado.</p>}
    {cf[e.id]&&<p className="mt-3 text-sm font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2"><I n="alert" s={18} c="flex-shrink-0"/>Horário sobreposto com: {cf[e.id].join(', ')}.</p>}
    {passado(e,now)&&<><Obs title={e.t} desc={e.l}/><p className="mt-2 text-[11px] text-slate-500">Demonstração: a observação ainda não é salva no servidor.</p></>}
    <div className="flex gap-2 mt-6 flex-wrap"><button onClick={()=>ask('Me ajude com o compromisso "'+e.t+'" de '+d.getDate()+'/'+pad(d.getMonth()+1))} className={btnP+' flex items-center gap-2'}><I n="spark" s={16} c="text-[#F6E0B6]"/>Perguntar à EunomIA</button><button onClick={fechar} className={btnS}>Fechar</button></div>
  </div></div>)}


function Revisar(){const [l,setL]=useState(SUG);const rm=id=>setL(l.filter(x=>x.id!==id));return(
<div className="p-6 lg:p-10 max-w-4xl mx-auto">
  <Head t="Para revisar" sub="Sugestões que a EunomIA encontrou nos seus e-mails e mensagens."/>
  <div className="grid sm:grid-cols-2 gap-5">{l.map(s=><Approval key={s.id} {...s} onDone={()=>rm(s.id)}/>)}</div>
  {!l.length&&<div className={card}><Empty t="Tudo revisado" d="Quando surgir um novo compromisso, ele aparece aqui."/></div>}
</div>)}

const MAILS=[
{n:'Orientador do TCC',s:'Reunião de orientação',p:'Podemos conversar hoje às 12:00 pelo Meet para revisar o capítulo de metodologia?',h:'10:42',ev:{m:'OUT',d:'31',t:'Reunião do TCC',h:'12:00 - 13:00'}},
{n:'Coordenação de Computação',s:'Calendário de provas',p:'A prova de Banco de Dados foi marcada para quinta-feira, dia 05/11, às 07:30.',h:'09:58',ev:{m:'NOV',d:'05',t:'Prova de Banco de Dados',h:'07:30 - 09:30'}},
{n:'Monitoria de Estruturas de Dados',s:'Plantão de dúvidas',p:'O plantão desta semana será na terça, das 14:00 às 16:00, na sala 12.',h:'08:15',ev:{m:'NOV',d:'03',t:'Plantão de Estruturas de Dados',h:'14:00 - 16:00'}},
{n:'Centro Acadêmico',s:'Inscrições abertas para o hackathon',p:'As inscrições para a maratona de projetos vão até o dia 10/11.',h:'Ontem'}];
function Emails(){const [sel,setSel]=useState(0);const [added,setAdded]=useState({});const m=MAILS[sel];return(
<div className="flex flex-col md:flex-row md:h-[calc(100vh-5rem)]">
  <div className="md:w-96 border-r border-slate-200/60 bg-white flex flex-col flex-shrink-0 md:h-full overflow-y-auto">
    <h2 className="p-4 font-bold text-[#3D1534] text-lg border-b border-slate-100">Caixa de entrada</h2>
    {MAILS.map((e,i)=><button key={i} onClick={()=>setSel(i)} className={`text-left p-4 border-b border-slate-50 border-l-4 ${sel===i?'bg-[#3E4B8E]/5 border-l-[#3E4B8E]':'hover:bg-slate-50 border-l-transparent'}`}>
      <div className="flex justify-between items-baseline mb-1"><span className={`font-bold text-sm ${sel===i?'text-[#3E4B8E]':'text-slate-800'}`}>{e.n}</span><span className="text-xs text-slate-400">{e.h}</span></div>
      <p className="text-sm font-semibold text-slate-800 truncate">{e.s}</p><p className="text-xs text-slate-500 line-clamp-2 mt-1">{e.p}</p>
      {e.ev&&<span className="inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded-md bg-[#FFF4EB] text-[#C29352] text-[11px] font-bold"><I n="zap" s={12}/>Evento identificado</span>}
    </button>)}
  </div>
  <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
    <div className="h-16 px-6 border-b border-slate-200/60 bg-white flex items-center gap-2 flex-shrink-0">{['archive','trash','reply'].map(i=><button key={i} aria-label={i} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full"><I n={i} s={18}/></button>)}</div>
    <div className="flex-1 overflow-y-auto p-4 md:p-8"><div className="max-w-3xl mx-auto bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-slate-100">
      <h1 className="text-2xl font-bold text-[#3D1534] mb-6">{m.s}</h1>
      <div className="flex items-center gap-4 mb-8"><div className="w-12 h-12 rounded-full bg-[#3E4B8E]/10 text-[#3E4B8E] flex items-center justify-center font-bold text-lg">{m.n[0]}</div><div><p className="font-bold text-slate-800">{m.n}</p><p className="text-sm text-slate-500">Para mim • {m.h}</p></div></div>
      <div className="text-slate-700 space-y-4 leading-relaxed"><p>Olá Marcos,</p><p>{m.p}</p><p>Qualquer dúvida, é só responder este e-mail.</p></div>
      {m.ev&&<div className="mt-10 bg-[#FFF4EB] border border-[#C29352]/30 rounded-2xl p-6 relative overflow-hidden"><div className="absolute top-0 left-0 w-1 h-full bg-[#C29352]"/>
        <div className="flex gap-4"><div className="w-10 h-10 rounded-full bg-white text-[#C29352] flex items-center justify-center shadow-sm flex-shrink-0"><I n="zap" s={20}/></div><div>
          <h3 className="font-bold text-[#3D1534]">A EunomIA encontrou um compromisso</h3>
          <div className="bg-white p-4 rounded-xl my-4 border border-slate-100 flex items-center gap-4"><div className="w-12 h-12 bg-slate-50 rounded-lg flex flex-col items-center justify-center border border-slate-100"><span className="text-[10px] font-bold text-rose-500">{m.ev.m}</span><span className="text-lg font-bold leading-none">{m.ev.d}</span></div><div><p className="font-bold text-slate-800">{m.ev.t}</p><p className="text-sm text-slate-500 flex items-center gap-1.5"><I n="clock" s={14}/>{m.ev.h}</p></div></div>
          {added[sel]?<p className="text-sm font-bold text-emerald-700 flex items-center gap-2"><I n="check" s={16}/>Adicionado à agenda</p>:<div className="flex gap-3 flex-wrap"><button onClick={()=>setAdded({...added,[sel]:1})} className={btnP}>Adicionar à agenda</button><button className={btnS}>Ignorar</button></div>}
        </div></div></div>}
    </div></div>
  </div>
</div>)}

function Tarefas(){const [l,setL]=useState([['Lista 4 de Estruturas de Dados','Hoje',0],['Capítulo de metodologia do TCC','Hoje',1],['Relatório do laboratório de Redes','Dom, 01',0],['Resumo de Compiladores para a prova','Dom, 01',0],['Modelagem do projeto de Banco de Dados','Ter, 03',0]]);const [v,setV]=useState('');const [f,setF]=useState('todas');
const shown=l.map((x,i)=>[...x,i]).filter(x=>f==='todas'||(f==='abertas'?!x[2]:x[2]));return(
<div className="p-6 lg:p-10 max-w-3xl mx-auto">
  <Head t="Tarefas" sub={`${l.filter(x=>!x[2]).length} para concluir`}/>
  <div className="flex gap-2 mb-5">{['todas','abertas','feitas'].map(k=><button key={k} onClick={()=>setF(k)} className={`px-4 py-2 rounded-full text-sm font-bold capitalize ${f===k?'bg-[#3E4B8E]/10 text-[#3E4B8E]':'text-slate-500 hover:bg-slate-100'}`}>{k}</button>)}</div>
  <div className="flex items-center bg-white rounded-2xl border border-slate-100 shadow-sm p-1.5 mb-5"><input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&v.trim()){setL([[v.trim(),'Hoje',0],...l]);setV('')}}} placeholder="Adicionar tarefa" className="flex-1 px-4 py-2.5 text-sm outline-none bg-transparent"/><button onClick={()=>{if(v.trim()){setL([[v.trim(),'Hoje',0],...l]);setV('')}}} className="w-10 h-10 rounded-xl bg-[#C29352] text-white flex items-center justify-center hover:bg-[#a67c42]" aria-label="Adicionar"><I n="plus"/></button></div>
  <div className={`${card} divide-y divide-slate-50`}>{shown.map(([t,d,ok,i])=>
    <label key={i} className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/60">
      <input type="checkbox" checked={!!ok} onChange={()=>setL(l.map((x,j)=>j===i?[x[0],x[1],ok?0:1]:x))} className="w-5 h-5 rounded-md border-slate-300 text-[#3E4B8E] focus:ring-0"/>
      <span className={`flex-1 text-sm font-semibold ${ok?'text-slate-400 line-through':'text-slate-800'}`}>{t}</span>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${d==='Hoje'&&!ok?'bg-[#FFF4EB] text-[#C29352]':'bg-slate-100 text-slate-500'}`}>{d}</span>
    </label>)}{!shown.length&&<Empty t="Nenhuma tarefa aqui" d="Digite acima para criar a primeira."/>}</div>
</div>)}

const LOG=[['09:35','Observação salva em "Monitoria de Estruturas de Dados"','Você registrou como foi','task'],['09:12','Reposição de Redes de Computadores cancelada','Você foi avisado por e-mail','mail'],['Ontem','Conflito detectado em 31/10, 12:30','Reunião do TCC e estudo em grupo','alert'],['Ontem','Entrega da lista de Grafos marcada como concluída','Marcada por você','task'],['28/10','Agenda sincronizada com o Google Workspace','6 eventos atualizados','clock']];
function Historico(){const [u,setU]=useState({});return(
<div className="p-6 lg:p-10 max-w-3xl mx-auto"><Head t="Histórico" sub="Aulas e reuniões que já aconteceram e o que a EunomIA fez por você."/>
  <h2 className="font-bold text-[#3D1534] mb-3">Aulas e reuniões realizadas</h2>
  <div className={`${card} divide-y divide-slate-50 mb-8`}>{[['30/10 • 07:30','Redes de Computadores','Sala 05 • Bloco B','Roteamento: faltou revisar RIP. Prova em 12/11.'],['30/10 • 09:30','Engenharia de Software','Laboratório 02','Papéis do grupo definidos no projeto.'],['29/10 • 09:30','Banco de Dados','Laboratório 02']].map(([h,t,d,o])=><div key={t} className="p-5"><p className="text-xs font-medium text-slate-400">{h}</p><p className="text-sm font-bold text-[#3D1534]">{t}</p><p className="text-xs text-slate-500">{d}</p><Obs obs={o} title={t} desc={d}/></div>)}</div>
  <h2 className="font-bold text-[#3D1534] mb-3">Ações da EunomIA</h2>
  <div className={`${card} divide-y divide-slate-50`}>{LOG.map(([h,t,d,ic],i)=>
    <div key={i} className="flex items-center gap-4 p-5"><div className="w-10 h-10 rounded-full bg-[#FFF4EB] text-[#C29352] flex items-center justify-center flex-shrink-0"><I n={ic} s={18}/></div>
      <div className="flex-1 min-w-0"><p className={`text-sm font-bold ${u[i]?'text-slate-400 line-through':'text-[#3D1534]'}`}>{t}</p><p className="text-xs text-slate-500 mt-0.5">{d}</p></div>
      <span className="text-xs font-medium text-slate-400">{h}</span>
      {i<2&&<button onClick={()=>setU({...u,[i]:1})} disabled={u[i]} className="text-xs font-bold text-[#3E4B8E] px-3 py-1.5 rounded-full hover:bg-[#3E4B8E]/5 disabled:text-slate-400">{u[i]?'Desfeito':'Desfazer'}</button>}
    </div>)}</div></div>)}

function Toggle({on,set}){return(<button role="switch" aria-checked={on} onClick={()=>set(!on)} className={`w-12 h-7 rounded-full p-1 flex-shrink-0 transition-colors ${on?'bg-[#3E4B8E]':'bg-slate-300'}`}><span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on?'translate-x-5':''}`}/></button>)}
function Rows({items}){const [s,setS]=useState(items.map(x=>x[2]));return(
<div className={`${card} divide-y divide-slate-50`}>{items.map(([t,d],i)=><div key={t} className="flex items-center gap-4 p-5"><div className="flex-1"><p className="text-sm font-bold text-[#3D1534]">{t}</p><p className="text-xs text-slate-500 mt-0.5">{d}</p></div><Toggle on={s[i]} set={v=>setS(s.map((x,j)=>j===i?v:x))}/></div>)}</div>)}

function Regras(){return(
<div className="p-6 lg:p-10 max-w-3xl mx-auto"><Head t="Regras" sub="Defina o que a EunomIA pode fazer sozinha e o que precisa da sua aprovação."><button className={btnP+' flex items-center gap-2'}><I n="plus" s={18} c="text-[#C29352]"/>Nova regra</button></Head>
<Rows items={[['Pedir aprovação antes de criar eventos','Sugestões de e-mail e WhatsApp vão para "Para revisar".',1],['Lembrar das entregas 24 horas antes','Listas, relatórios e trabalhos com prazo.',1],['Proteger o horário de aula','Não aceitar reuniões durante as aulas do semestre.',1],['Reservar tempo de estudo antes das provas','Bloqueia 2 horas por dia na semana da prova.',0],['Resumo diário às 06:30','Aulas, entregas e tarefas do dia.',1]]}/></div>)}


function Selo({t,k}){const m={ok:['bg-emerald-50 text-emerald-700','check'],aviso:['bg-amber-50 text-amber-700','alert'],off:['bg-slate-100 text-slate-500','ban']}[k];return <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${m[0]}`}><I n={m[1]} s={12}/>{t}</span>}
function Prov({nome,ini,servs,selo,children}){return(
<section className={`${card} p-5 sm:p-6 mb-5`}><div className="flex items-start gap-4 mb-4 flex-wrap"><div className="w-11 h-11 rounded-full bg-[#FFF4EB] text-[#C29352] font-extrabold flex items-center justify-center">{ini}</div><div className="flex-1 min-w-0"><h3 className="font-extrabold text-[#3D1534]">{nome}</h3><div className="flex gap-1.5 flex-wrap mt-1">{servs.map(x=><span key={x} className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md">{x}</span>)}</div></div>{selo}</div>{children}</section>)}

const campoData="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-[#3E4B8E] focus:ring-2 focus:ring-[#3E4B8E]/20";
const PERIODOS=[[7,'Últimos 7 dias'],[30,'Últimos 30 dias'],[90,'Últimos 90 dias']];
function Configs(){
const [st,setSt]=useState({s:'loading',d:null,err:null});
const [syn,setSyn]=useState({s:'idle',r:null,err:null,em:null});
const [desde,setDesde]=useState(()=>key(addD(new Date(),-30)));
const [ate,setAte]=useState(()=>key(new Date()));
const [msg,setMsg]=useState('');
const carregar=React.useCallback((quieto)=>{if(!quieto)setSt(p=>({...p,s:'loading',err:null}));
  obterStatusGoogle().then(d=>setSt({s:'ok',d,err:null})).catch(err=>setSt({s:'erro',d:null,err}))},[]);
useEffect(()=>{carregar(false);const f=()=>{if(document.visibilityState==='visible')carregar(true)};document.addEventListener('visibilitychange',f);return()=>document.removeEventListener('visibilitychange',f)},[carregar]);
const d=st.d,conectado=st.s==='ok'&&d.connected,semAgenda=conectado&&!d.calendar_connected;
const selo=st.s==='loading'?<Selo t="Verificando" k="off"/>:st.s==='erro'?<Selo t="Sem resposta da API" k="aviso"/>:!conectado?<Selo t="Não conectado" k="off"/>:semAgenda?<Selo t="Precisa reconectar" k="aviso"/>:<Selo t="Conectado" k="ok"/>;
const autorizar=()=>{setMsg('Redirecionando para o Google…');window.location.assign(urlAutorizacaoGoogle())};
const periodo=n=>{setDesde(key(addD(new Date(),-n)));setAte(key(new Date()))};
const erroPeriodo=!desde||!ate?'Informe as duas datas do período.':desde>ate?'A data inicial não pode ser depois da data final.':'';
const sincronizar=()=>{if(erroPeriodo)return;setSyn({s:'loading',r:null,err:null,em:null});
  sincronizarGoogle(desde,ate).then(r=>{setSyn({s:'ok',r,err:null,em:new Date().toLocaleString('pt-BR')});carregar(true)}).catch(err=>setSyn({s:'erro',r:null,err,em:null}))};
const RES=[['emails','E-mails lidos'],['email_threads_with_events','Conversas com eventos'],['pending_items','Itens pendentes de revisão']];
return(
<div className="p-4 sm:p-6 lg:p-10 max-w-3xl mx-auto"><Head t="Configurações" sub="Gerencie as contas que alimentam a sua agenda."/>
  <h2 className="text-lg font-extrabold text-[#3D1534] mb-1">Central de integrações</h2>
  <p className="text-sm text-slate-500 mb-5">Por enquanto o EunomIA suporta uma única conta Google. Os demais provedores ainda estão em desenvolvimento.</p>
  <p role="status" aria-live="polite" className={`text-sm font-semibold text-[#3E4B8E] mb-3 ${msg?'':'hidden'}`}>{msg}</p>
  <Prov nome="Google" ini="G" servs={['Gmail','Google Calendar']} selo={selo}>
    {st.s==='loading'&&<p role="status" aria-live="polite" className="text-sm font-semibold text-slate-500">Verificando a conexão com o Google…</p>}
    {st.s==='erro'&&<div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-semibold">{mensagemErro(st.err,'consultar o status da conexão com o Google')}</p><button onClick={()=>carregar(false)} className="mt-2 font-bold underline">Tentar novamente</button></div>}
    {st.s==='ok'&&!conectado&&<div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"><p className="font-bold text-sm text-[#3D1534]">Nenhuma conta Google conectada</p><p className="text-xs text-slate-500 mt-1">Conecte sua conta para o EunomIA ler e-mails e usar o Google Calendar.</p><div className="mt-3"><button onClick={autorizar} className={btnP+' !py-2'}>Conectar conta Google</button></div></div>}
    {conectado&&<div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap"><p className="font-bold text-sm text-[#3D1534] break-all">{d.email||'Conta Google conectada'}</p>{semAgenda?<Selo t="Precisa reconectar" k="aviso"/>:<Selo t="Conectado" k="ok"/>}</div>
      <ul className="mt-3 space-y-1"><li className="text-xs text-slate-600 flex items-center gap-2"><I n="check" s={14} c="text-emerald-600"/>Ler e-mails (Gmail)</li>
        <li className="text-xs text-slate-600 flex items-center gap-2">{d.calendar_connected?<I n="check" s={14} c="text-emerald-600"/>:<I n="alert" s={14} c="text-amber-600"/>}{d.calendar_connected?'Ler e editar eventos (Google Calendar)':'Google Calendar sem autorização. Reconecte a conta para liberar.'}</li></ul>
      <p className="text-xs text-slate-500 mt-3">Última sincronização: {syn.em?syn.em+' (nesta sessão)':'não informada pela API'}</p>
      <div className="mt-3 flex gap-2 flex-wrap"><button onClick={autorizar} className={semAgenda?btnP+' !py-2':btnS+' !py-2'}>Reconectar conta</button></div></div>}
    {conectado&&<div className="mt-5">
      <h3 className="font-extrabold text-[#3D1534] text-sm mb-1">Sincronização manual</h3>
      <p className="text-xs text-slate-500 mb-3">Escolha o período de e-mails que a EunomIA deve analisar.</p>
      <div className="flex gap-2 flex-wrap mb-3">{PERIODOS.map(([n,l])=><button key={n} onClick={()=>periodo(n)} className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100">{l}</button>)}</div>
      <div className="flex gap-3 flex-wrap items-end">
        <label className="text-xs font-bold text-slate-600 flex flex-col gap-1">De<input type="date" value={desde} max={ate||undefined} onChange={e=>setDesde(e.target.value)} className={campoData}/></label>
        <label className="text-xs font-bold text-slate-600 flex flex-col gap-1">Até<input type="date" value={ate} min={desde||undefined} onChange={e=>setAte(e.target.value)} className={campoData}/></label>
        <button onClick={sincronizar} disabled={syn.s==='loading'||!!erroPeriodo} className={btnP+' !py-2.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed'}><I n="refresh" s={16} c={syn.s==='loading'?'animate-spin':''}/>{syn.s==='loading'?'Sincronizando…':'Sincronizar agora'}</button>
      </div>
      {erroPeriodo&&<p role="alert" className="text-xs font-semibold text-rose-700 mt-2">{erroPeriodo}</p>}
      {syn.s==='loading'&&<p role="status" aria-live="polite" className="text-xs font-semibold text-slate-500 mt-3">Lendo e-mails. Isso pode levar alguns instantes.</p>}
      {syn.s==='erro'&&<div role="alert" className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-semibold">{mensagemErro(syn.err,'sincronizar com o Google')}</p></div>}
      {syn.s==='ok'&&<div role="status" aria-live="polite" className="mt-3"><p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 mb-2"><I n="check" s={14}/>Sincronização concluída em {syn.em}</p>
        <div className="grid sm:grid-cols-3 gap-3">{RES.map(([k,l])=><div key={k} className="rounded-2xl border border-slate-100 bg-white p-4"><p className="text-2xl font-extrabold text-[#3D1534]">{syn.r[k]==null?'—':syn.r[k]}</p><p className="text-xs font-semibold text-slate-500 mt-1">{l}</p></div>)}</div></div>}
    </div>}
  </Prov>
  <Prov nome="Microsoft" ini="M" servs={['Outlook','Microsoft 365','Reuniões do Teams']} selo={<Selo t="Indisponível" k="off"/>}>
    <p className="text-sm text-slate-500">A integração com a Microsoft ainda não foi implementada. Quando estiver pronta, você poderá conectar suas contas aqui.</p>
    <button disabled className={btnS+' mt-4 opacity-50 cursor-not-allowed'}>Conectar (em breve)</button>
  </Prov>
  <Prov nome="Outros provedores" ini="+" servs={['Calendários','E-mails']} selo={<Selo t="Em breve" k="off"/>}>
    <div className="grid sm:grid-cols-2 gap-3">{[1,2].map(i=><div key={i} className="rounded-2xl border-2 border-dashed border-slate-200 p-4 text-sm text-slate-400 font-semibold flex items-center gap-2"><I n="plus" s={16}/>Novo provedor</div>)}</div>
  </Prov>
  <h2 className="text-lg font-extrabold text-[#3D1534] mt-8 mb-1">Notificações</h2>
  <p className="text-xs text-slate-500 mb-3">Demonstração: estas preferências ainda não são salvas no servidor.</p>
  <Rows items={[['Lembrete de aula e reunião','15 minutos antes de cada evento.',1],['Conflitos de horário','Avisar assim que forem detectados.',1],['Novas sugestões','Quando a EunomIA encontrar um compromisso.',0]]}/>
</div>)}

function Chat({open,close,seed}){
const [m,setM]=useState([]);const [v,setV]=useState('');React.useEffect(()=>{if(open&&seed)setV(seed)},[open,seed]);
const send=()=>{if(!v.trim())return;setM([...m,{u:1,t:v.trim()},{t:'Entendi. Por enquanto só consigo ajudar com compromissos das contas Google conectadas.'}]);setV('')};
return(<>
{open&&<div onClick={close} className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px] z-40"/>}
<aside aria-hidden={!open} className={`absolute top-4 right-4 bottom-4 w-[400px] max-w-[calc(100%-2rem)] bg-white rounded-3xl shadow-2xl shadow-[#3D1534]/10 border border-slate-100 z-50 flex flex-col transition-all duration-300 ${open?'translate-x-0 opacity-100':'translate-x-[120%] opacity-0 pointer-events-none'}`}>
  <div className="h-20 flex items-center justify-between px-6 border-b border-slate-100/50 flex-shrink-0">
    <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-[#FFF4EB] text-[#C29352] flex items-center justify-center"><I n="zap" s={20}/></div><div><h3 className="font-bold text-[#3D1534] leading-tight">EunomIA</h3><p className="text-xs font-medium text-emerald-600">Sempre online</p></div></div>
    <button onClick={close} aria-label="Fechar" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-full"><I n="x"/></button>
  </div>
  <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
    <div className="flex justify-end"><div className="bg-[#3E4B8E] text-white px-5 py-3.5 rounded-2xl rounded-tr-sm max-w-[85%] text-sm">Mude o estudo em grupo de Compiladores para as 14:00 e avise o grupo.</div></div>
    <div className="flex gap-3"><div className="w-8 h-8 rounded-full bg-[#3D1534] flex-shrink-0 flex items-center justify-center font-bold text-[10px]"><span className="text-white">E</span><span className="text-[#C29352]">IA</span></div>
      <div className="bg-white border border-slate-200/60 p-5 rounded-2xl rounded-tl-sm shadow-sm w-full text-sm">
        <p className="text-slate-700 mb-4">Preparei a mudança de horário e o aviso ao grupo. Isso resolve o conflito de hoje.</p>
        <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl mb-4"><p className="font-semibold text-slate-500 text-xs mb-1 line-through">Hoje • 12:30 - 14:00</p><p className="font-bold text-[#3E4B8E] flex items-center gap-2 mb-2"><I n="cal" s={16}/>Hoje • 14:00 - 15:30</p><p className="text-xs text-slate-600 border-t border-slate-200/60 pt-2">Destinatários: grupo de Compiladores</p></div>
        <div className="flex gap-2"><button className="flex-1 bg-[#3D1534] text-white py-2.5 rounded-xl font-bold hover:bg-[#2A0E24]">Confirmar</button><button className="flex-1 bg-white border border-slate-300 text-slate-700 py-2.5 rounded-xl font-bold hover:bg-slate-50">Editar</button></div>
      </div></div>
    {m.map((x,i)=>x.u?<div key={i} className="flex justify-end"><div className="bg-[#3E4B8E] text-white px-5 py-3.5 rounded-2xl rounded-tr-sm max-w-[85%] text-sm">{x.t}</div></div>:<div key={i} className="bg-white border border-slate-200/60 px-5 py-3.5 rounded-2xl rounded-tl-sm shadow-sm text-sm text-slate-700 max-w-[90%]">{x.t}</div>)}
  </div>
  <div className="p-4 bg-white border-t border-slate-100 rounded-b-3xl"><div className="relative flex items-center bg-slate-100 rounded-2xl p-1">
    <input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Pergunte sobre seus compromissos" className="w-full pl-4 pr-12 py-3 bg-transparent text-sm outline-none font-medium"/>
    <button onClick={send} aria-label="Enviar" className="absolute right-2 w-10 h-10 flex items-center justify-center bg-[#C29352] text-white rounded-xl hover:bg-[#a67c42] active:scale-95"><I n="send" s={18} c="ml-0.5"/></button>
  </div></div>
</aside></>)}

function App(){
const [seed,setSeed]=useState('');const [tab,setTab]=useState('hoje');const [chat,setChat]=useState(false);const [side,setSide]=useState(false);
const go=t=>{setTab(t);setSide(false)};
const V={hoje:<Hoje go={go}/>,agenda:<Agenda go={go} ask={t=>{setSeed(t);setChat(true)}}/>,revisar:<Revisar/>,emails:<Emails/>,tarefas:<Tarefas/>,historico:<Historico/>,regras:<Regras/>,configs:<Configs/>};
return(
<div className="flex h-full w-full overflow-hidden bg-slate-50 text-slate-800 selection:bg-[#3E4B8E] selection:text-white">
  {side&&<div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-20 md:hidden" onClick={()=>setSide(false)}/>}
  <aside className={`fixed md:relative top-0 left-0 h-full w-72 bg-white flex flex-col z-30 transition-transform duration-300 ${side?'translate-x-0':'-translate-x-full md:translate-x-0'} border-r border-slate-200/60`}>
    <div className="h-20 flex items-center px-6 flex-shrink-0"><Logo/></div>
    <nav className="flex-1 overflow-y-auto px-1 py-2 space-y-1">
      <div className="px-3 pb-4"><button onClick={()=>setChat(true)} className="w-full flex items-center gap-3 bg-[#FFF4EB] text-[#3D1534] hover:bg-[#FCE3CE] transition-colors py-3 px-4 rounded-xl font-semibold shadow-sm"><I n="plus" c="text-[#C29352]"/>Novo compromisso</button></div>
      {NAV.map(([id,l,ic,b])=><NavItem key={id} id={id} label={l} icon={ic} badge={b} cur={tab} go={go}/>)}
      <p className="pt-6 pb-2 px-6 text-xs font-bold text-slate-400">Sistema</p>
      {SYS.map(([id,l,ic])=><NavItem key={id} id={id} label={l} icon={ic} cur={tab} go={go}/>)}
    </nav>
    <button onClick={()=>go('configs')} className="p-4 flex items-center gap-3 hover:bg-slate-50 mx-2 rounded-xl mb-2 text-left">
      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#3E4B8E] to-[#3D1534] text-white flex items-center justify-center text-sm font-bold">MF</div>
      <div className="min-w-0"><p className="text-sm font-bold text-[#3D1534] truncate">Marcos Ferreira</p><p className="text-xs text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>Conectado</p></div>
    </button>
  </aside>
  <main className="flex-1 flex flex-col min-w-0 h-full relative">
    <header className="h-20 flex-shrink-0 bg-slate-50/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 z-10">
      <div className="flex items-center gap-4">
        <button aria-label="Menu" className="md:hidden p-2 text-slate-600 hover:bg-slate-200 rounded-full" onClick={()=>setSide(true)}><I n="menu" s={24}/></button>
        <div className="hidden sm:block relative w-[400px]"><I n="search" c="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input placeholder="Pesquise e-mails, pessoas ou reuniões" className="w-full pl-11 pr-4 py-3 bg-white rounded-full text-sm placeholder-slate-400 border-transparent focus:ring-2 focus:ring-[#3E4B8E]/20 shadow-sm"/></div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={()=>setChat(true)} className="flex items-center gap-2 px-5 py-2.5 bg-[#3D1534] text-white rounded-xl text-sm font-semibold hover:bg-[#2A0E24] transition-all shadow-sm active:scale-[0.98]"><I n="spark" s={16} c="text-[#F6E0B6]"/><span className="hidden sm:inline">EunomIA Assistant</span></button>
        <button aria-label="Notificações" className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-[#3D1534] flex items-center justify-center relative"><I n="bell"/><span className="absolute top-2 right-2.5 w-2 h-2 bg-rose-500 rounded-full border border-white"/></button>
      </div>
    </header>
    <div className="flex-1 overflow-y-auto">{V[tab]}</div>
    <Chat open={chat} seed={seed} close={()=>setChat(false)}/>
  </main>
</div>)}

export default App;
