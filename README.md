# EunomIA

Protótipo de assistente pessoal com FastAPI, SQLite e Gemini, incluindo chat, agenda local e integração opcional com Gmail.

## Requisitos

- Python 3.10 ou superior
- Node.js 20 ou superior e npm
- Para importar e-mails: credenciais OAuth do Google
- Opcional: chave da Gemini API

## Iniciar localmente

Abra dois terminais na raiz do projeto.

### API

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

A API e a documentação interativa ficam em <http://localhost:8000> e <http://localhost:8000/docs>. O banco SQLite `backend/eunomia.db` e alguns registros demonstrativos são criados no primeiro início.

### Interface

```powershell
cd frontend
npm install
npm run dev
```

Abra <http://localhost:5173>.

## Testes

Com as dependências de desenvolvimento instaladas:

```powershell
cd backend
python -m unittest discover -s tests -v
```

## Google OAuth

1. No Google Cloud Console, habilite Gmail API e Google Calendar API e configure a tela de consentimento OAuth.
2. Crie um OAuth Client ID do tipo **Web application**.
3. Cadastre `http://localhost:8000/api/integrations/google/callback` como URI de redirecionamento autorizada.
4. Informe `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `backend/.env`.
5. Reinicie a API e autorize a conta pelo endpoint `/api/integrations/google/auth`. A varredura acessa o Gmail e exige `GEMINI_API_KEY` para identificar compromissos nas mensagens. Ao confirmar uma reunião pendente, a EunomIA também a cria no calendário principal da conta conectada. Contas já conectadas antes desta alteração devem ser reconectadas para conceder a nova permissão do Calendar.

O consentimento solicita leitura do Gmail e permissão para criar eventos no Google Calendar. O token OAuth é armazenado no SQLite local; mantenha o arquivo do banco fora do controle de versão.

## Gemini

Preencha `GEMINI_API_KEY` em `backend/.env` para extrair compromissos das threads importadas do Gmail e habilitar respostas do assistente. `app.assistant` oferece duas funções: `generate_natural_response(prompt)` e `generate_structured_response(prompt, response_structure)`.

## Organização da lógica

- `app.main` registra os endpoints de chat, agenda local, tarefas, OAuth e sincronização do Gmail.
- `app.google_integration` lê mensagens do Gmail, registra os remetentes e classifica cada thread como reunião, prazo ou irrelevante. Reuniões recebem valores padrão para dados essenciais ausentes; prazos são salvos como tarefas sem duração, com prazo mantido vazio se não houver data ou referência. Reuniões e prazos ativos entram diretamente em Pendências, sem uma etapa separada de revisão; uma nova varredura reabre o item existente como pendente, enquanto cancelamentos removem os registros correspondentes.
- Em Pendências, reuniões e prazos podem ser abertos para ver detalhes, editados, confirmados ou cancelados. A confirmação de uma reunião também cria o evento no Google Calendar quando a conta estiver autorizada. Os remetentes dos e-mails aparecem nos detalhes e na descrição dos registros.
- `app.features.conflict_management.identify_conflicts` recebe e retorna a mesma lista de `MeetingRecord`, preenchendo `conflict` e `conflicts_with`. Para reuniões sem duração, considera uma estimativa de 60 minutos e classifica a sobreposição como possível.
- `app.models` contém estruturas distintas para reuniões e prazos de tarefas.
- `app.assistant` contém somente os dois adaptadores diretos para respostas do Gemini.
- `POST /api/chat` classifica mensagens com `app.features.intent_detection.detect_intent`. Conversas comuns recebem uma resposta natural do Gemini; reuniões retornam uma prévia como `MeetingRecord` e são salvas em `events` após confirmação em `POST /api/events`. Tarefas com prazo retornam uma prévia como `TaskDeadlineRecord` e são salvas em `tasks` após confirmação em `POST /api/tasks`. Solicitações incompletas pedem os dados necessários.
- `GET /api/events` e `GET /api/dashboard` alimentam a agenda e o painel da interface.
- Em Pendências, clicar em uma reunião ou prazo abre seus detalhes: título e descrição; reuniões também mostram início e duração, e tarefas mostram prazo e responsável quando informados.

## Limites desta versão

Reuniões confirmadas pelo chat aparecem em Pendências e recebem duração padrão de uma hora. Tarefas confirmadas aparecem como prazos em Pendências, com responsável e referência de prazo quando informados. A varredura do Gmail também adiciona reuniões e prazos diretamente a Pendências. A confirmação de uma reunião cria um evento no Google Calendar, quando a conta estiver conectada e autorizada. O protótipo ainda não inclui login próprio, isolamento multiusuário, remoção/desconexão de credenciais, atualização incremental em segundo plano, notificações ou voz.
