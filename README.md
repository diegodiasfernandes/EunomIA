# EunomIA

Protótipo de assistente pessoal com FastAPI, SQLite e Gemini, incluindo chat, agenda local e integração opcional com Gmail.

## Requisitos

- Python 3.10 ou superior
- Node.js 20.19 ou superior (ou 22.12+) e npm
- Para a extensão: Google Chrome ou outro navegador baseado em Chromium (Edge, Brave)
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

### Extensão do Google Calendar

A extensão coloca o botão da EunomIA na lateral direita do Google Calendar. O painel reúne o que aguarda aprovação, a agenda gerenciada pela EunomIA (com conflitos e histórico), a varredura de e-mails e o chat. Ela não funciona sozinha: todos os dados vêm da API, que precisa estar em execução (veja [API](#api)).

#### 1. Configurar a URL da API (opcional)

Por padrão a extensão acessa `http://localhost:8000`. Para usar outro endereço, crie `extension/.env` a partir do exemplo e altere `VITE_API_URL`:

```powershell
cd extension
Copy-Item .env.example .env
```

A extensão só recebe permissão de acesso a essa origem. Como o valor é embutido no build, qualquer alteração exige gerar a extensão de novo e recarregá-la no navegador.

#### 2. Instalar e gerar a extensão

```powershell
cd extension
npm install
npm run build
```

O build verifica os tipos (`tsc`) e grava a extensão pronta em `extension/dist`.

#### 3. Carregar no Chrome

1. Abra `chrome://extensions` (no Edge, `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/dist`.
4. A extensão **EunomIA para Google Calendar** aparece na lista; não é preciso fixá-la na barra, pois ela atua dentro do Calendar.

#### 4. Usar

1. Inicie a API (`uvicorn app.main:app --reload --port 8000` em `backend`).
2. Abra <https://calendar.google.com> (ou recarregue a aba, se já estava aberta) e clique no botão azul na lateral direita.
3. Para importar e-mails e criar reuniões e tarefas no Google, clique em **Conectar Google**. O consentimento OAuth abre em uma janela própria, que fecha sozinha quando a API confirma as permissões do Calendar e do Tasks. Esse passo exige as credenciais descritas em [Google OAuth](#google-oauth).

#### Desenvolvimento com recarga automática

```powershell
cd extension
npm run dev
```

O servidor de desenvolvimento usa a porta 5174 e também grava em `extension/dist`; carregue essa pasta como no passo 3. Mantenha o `npm run dev` rodando enquanto usar essa versão, pois ela busca o código no servidor local. Alterações no painel são aplicadas automaticamente; alterações no `manifest.config.ts` ou no `.env` exigem reiniciar o comando e recarregar a extensão. Para checar os tipos sem gerar o build, use `npm run typecheck`. Ao terminar, rode `npm run build` para voltar a uma versão que funciona sem o servidor.

#### Atualizar após mudanças

Depois de um novo `npm run build`, clique em **Recarregar** (↻) no cartão da extensão em `chrome://extensions` e recarregue a aba do Google Calendar.

#### Problemas comuns

- **"Não foi possível acessar a API em …"**: a API não está em execução ou `VITE_API_URL` aponta para outro endereço.
- **O botão não aparece**: recarregue a aba do Calendar depois de instalar ou recarregar a extensão e confira se ela está ativada em `chrome://extensions`.
- **`npm run dev` falha com porta em uso**: libere a porta 5174, que é fixa na configuração.
- **Conectar Google não conclui**: confira `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e o URI de redirecionamento no Google Cloud Console.

## Testes

Com as dependências de desenvolvimento instaladas:

```powershell
cd backend
python -m unittest discover -s tests -v
```

Para testar o pop-up de contas no Windows, com Google Chrome instalado, gere primeiro o build da extensão e execute na raiz:

```powershell
backend\.venv\Scripts\python.exe extension\tests\accounts_browser.py
```

O teste usa Chrome headless com perfil temporário e API simulada local: verifica abertura, identidade, fechamento por Esc e clique fora, confirmação, cancelamento, falha, nova tentativa e estado desconectado. Não acessa nem desconecta contas Google reais.

## Contas Google

Clique no avatar ou no e-mail do cabeçalho para abrir **Contas conectadas**. **Desconectar** pede confirmação antes de chamar `POST /api/integrations/google/disconnect` com `expected_email` e `confirmed: true`. O backend revoga a autorização no Google, remove os tokens locais e invalida tentativas OAuth pendentes. Se a revogação falhar, retorna erro e preserva a conexão local para nova tentativa. Eventos, e-mails e tarefas no Google não são apagados; as credenciais OAuth da aplicação permanecem intactas.

Os registros locais da conta desconectada são preservados em um espaço arquivado por conta. Ao conectar a mesma conta, seus registros voltam ao espaço ativo; outra conta recebe somente os próprios registros. Dados locais anteriores à primeira conexão permanecem arquivados separadamente. A aplicação continua com uma única conta ativa; **Adicionar nova conta — Em breve** permanece desabilitado.

O status retornado por `/api/integrations/google/status` e `/api/dashboard` inclui nome e identificador da conexão, sem tokens. O nome real é obtido do Google durante a autorização com a permissão `userinfo.profile`; conexões anteriores podem precisar de nova autorização para fornecê-lo. Sem nome disponível, o painel usa “Conta Google” e o e-mail real. O OAuth permite escolher a conta com `consent select_account`.

O painel separa caches por conexão e reinicia conversas e detalhes em memória ao trocar de conta. Solicitações antigas com `X-Eunomia-Connection` incompatível são rejeitadas, evitando aplicar ações à conta seguinte. No backend local, mantenha uma única instância/worker do Uvicorn: as operações da conta e as requisições são serializadas para evitar troca durante uma sincronização em andamento.

## Google OAuth

1. No Google Cloud Console, habilite Gmail API, Google Calendar API e Google Tasks API e configure a tela de consentimento OAuth.
2. Crie um OAuth Client ID do tipo **Web application**.
3. Cadastre `http://localhost:8000/api/integrations/google/callback` como URI de redirecionamento autorizada.
4. Informe `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `backend/.env`.
5. Reinicie a API e autorize a conta pelo endpoint `/api/integrations/google/auth`. A varredura acessa o Gmail e exige `GEMINI_API_KEY` para identificar compromissos nas mensagens. Ao confirmar uma reunião ou prazo pendente, a EunomIA cria, respectivamente, um evento no calendário principal ou uma tarefa na lista padrão do Google Tasks. Contas já conectadas devem ser reconectadas para conceder a permissão do Google Tasks.

O consentimento solicita leitura do Gmail e permissões para criar eventos no Google Calendar e tarefas no Google Tasks. O token OAuth é armazenado no SQLite local; mantenha o arquivo do banco fora do controle de versão.

## Agenda da extensão

A aba Agenda consulta `GET /api/agenda` no backend, que usa `calendarList.list` e `events.list` do Google Calendar. A consulta é somente leitura: não cria, altera ou importa eventos para as pendências locais. Aprovações e seu histórico continuam usando os endpoints locais existentes.

Além da permissão de eventos já utilizada, a conexão solicita `https://www.googleapis.com/auth/calendar.calendarlist.readonly` para listar os calendários acessíveis. Após atualizar e reiniciar o backend, reconecte o Google na extensão para conceder essa permissão. Não é necessário trocar as credenciais OAuth.

A listagem começa à meia-noite de hoje no fuso `America/Sao_Paulo` e consulta períodos de 90 dias. O botão **Ver próximos 90 dias** carrega o período seguinte (`GET /api/agenda?from_date=AAAA-MM-DD`). Todas as páginas de calendários e eventos são percorridas em cada período; instâncias recorrentes são expandidas pelo Google. O botão **Atualizar agenda** consulta novamente os períodos carregados.

Calendários especiais de feriados e aniversários dos contatos são omitidos por seus identificadores do Google. Eventos do tipo `birthday` também são omitidos, inclusive no calendário principal. Os calendários pessoais e compartilhados, eventos normais e eventos da EunomIA são preservados; tarefas e aprovações mantêm seu funcionamento. O filtro afeta somente a exibição na EunomIA, sem excluir calendários ou eventos no Google.

Somente eventos reais, não cancelados ou recusados, são exibidos. O ID do Google vincula os eventos do calendário principal aos registros locais já aprovados, inclusive instâncias recorrentes; esses recebem **Confirmado**. Eventos externos recebem **Google**. Alterações feitas no Google são refletidas pela leitura seguinte, sem sobrescrever propostas pendentes. Eventos de dia inteiro preservam suas datas; o término retornado pelo Google é exclusivo e a interface mostra o último dia incluído. Sem conexão, a extensão pede autorização e não apresenta dados demonstrativos.

## Gemini

Preencha `GEMINI_API_KEY` em `backend/.env` para extrair compromissos das threads importadas do Gmail e habilitar respostas do assistente. `app.assistant` oferece duas funções: `generate_natural_response(prompt)` e `generate_structured_response(prompt, response_structure)`.

## Organização da lógica

- `app.main` registra os endpoints de chat, agenda local, tarefas, OAuth e sincronização do Gmail.
- `app.google_integration` lê mensagens do Gmail, registra os remetentes e classifica cada thread como reunião, prazo ou irrelevante. Reuniões recebem valores padrão para dados essenciais ausentes; prazos são salvos como tarefas sem duração, com prazo mantido vazio se não houver data ou referência. Reuniões e prazos ativos entram diretamente em Pendências, sem uma etapa separada de revisão; uma nova varredura reabre o item existente como pendente, enquanto cancelamentos removem os registros correspondentes.
- Em Pendências, reuniões e prazos podem ser abertos para ver detalhes, editados, confirmados ou cancelados. A confirmação de uma reunião cria um evento no Google Calendar e a confirmação de um prazo cria uma tarefa no Google Tasks, quando a conta estiver autorizada. Os remetentes dos e-mails aparecem nos detalhes e na descrição dos registros.
- `app.features.conflict_management.identify_conflicts` recebe e retorna a mesma lista de `MeetingRecord`, preenchendo `conflict` e `conflicts_with`. Para reuniões sem duração, considera uma estimativa de 60 minutos e classifica a sobreposição como possível.
- `app.models` contém estruturas distintas para reuniões e prazos de tarefas.
- `app.assistant` contém somente os dois adaptadores diretos para respostas do Gemini.
- `POST /api/chat` classifica mensagens com `app.features.intent_detection.detect_intent`. Conversas comuns recebem uma resposta natural do Gemini; reuniões retornam uma prévia como `MeetingRecord` e são salvas em `events` após confirmação em `POST /api/events`. Tarefas com prazo retornam uma prévia como `TaskDeadlineRecord` e são salvas em `tasks` após confirmação em `POST /api/tasks`. Solicitações incompletas pedem os dados necessários.
- `GET /api/events` e `GET /api/dashboard` alimentam a agenda e o painel da interface.
- Em Pendências, clicar em uma reunião ou prazo abre seus detalhes: título e descrição; reuniões também mostram início e duração, e tarefas mostram prazo e responsável quando informados.

## Limites desta versão

Reuniões confirmadas pelo chat aparecem em Pendências e recebem duração padrão de uma hora. Tarefas confirmadas aparecem como prazos em Pendências, com responsável e referência de prazo quando informados. A varredura do Gmail também adiciona reuniões e prazos diretamente a Pendências. As confirmações criam os respectivos itens no Google Calendar ou Google Tasks quando a conta estiver conectada e autorizada. O protótipo ainda não inclui login próprio, isolamento multiusuário, remoção/desconexão de credenciais, atualização incremental em segundo plano, notificações ou voz.
