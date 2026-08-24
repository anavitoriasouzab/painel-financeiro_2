# Painel Financeiro — Contexto para o Claude

Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão.
Mantenha atualizado conforme o projeto evoluir.

## O que é o projeto

Painel financeiro pessoal: dashboard, contas (fixas/variáveis), parcelamentos,
metas, planejamento e limite de comprometimento de renda. Interface em pt-BR.

## Stack atual

- HTML + CSS + JavaScript vanilla — sem framework, sem bundler
- Módulos organizados como objetos globais (`const NomeDoModulo = {...}`),
  um arquivo por módulo em `js/`
- Sem build step: arquivos servidos como estão (usar Live Server do VS Code
  para desenvolvimento local)

## Como rodar/testar

- Abrir `index.html` direto no navegador, ou usar Live Server
- Não há testes automatizados nem lint configurado ainda
- Antes de considerar qualquer tarefa concluída, testar manualmente em
  desktop, tablet e mobile (ver "Definição de pronto" abaixo)

## Estrutura de módulos (js/)

| Arquivo | Responsabilidade |
|---|---|
| `storage.js` | Única porta de entrada/saída de dados. Ninguém mais acessa dados diretamente. |
| `calculations.js` (`Calc`) | Funções puras de cálculo financeiro |
| `app.js` | Ponto de entrada, navegação entre views. Também faz a guarda de sessão em index.html (`requireAuth`, classe `authed`, botões de logout) — ver seção "Autenticação" abaixo |
| `dashboard.js`, `accounts.js`, `profile.js`, `planning.js`, `goals.js`, `installments.js`, `charts.js` | Uma view cada — renderização isolada |
| `backup.js` | Export/import de dados em JSON |
| `auth.js` | Roda em login.html: lógica de login/cadastro/esqueci senha (e login/cadastro com Google) via Supabase Auth |
| `supabase-config.js` | Cria `supabaseClient` (URL + publishable key) — usado por app.js e auth.js |

Ao adicionar um módulo novo, ele precisa ser incluído no `<script>` do
`index.html` respeitando a ordem de dependência (storage e calc primeiro).

## Arquitetura de dados — MIGRAÇÃO CONCLUÍDA (localStorage → Supabase)

O projeto migrou de `localStorage` para Supabase (Postgres + Auth), para
suportar múltiplos usuários e login. **Schema criado e aplicado** (ver
`supabase/migrations/`) e **`js/storage.js` já reescrito**: `load()`/`save()`
leem e gravam direto nas tabelas Supabase (`_readAll`/`_writeAll`), mantendo
a mesma assinatura de métodos que o resto do app já usava.

Projeto Supabase: "anavitoriasouzab's Project" (ref `bgconighgmkibezllirw`,
região `ca-central-1`).

### Regra crítica
`Storage` (`js/storage.js`) continua sendo a ÚNICA porta de entrada/saída de
dados do app. Nenhum outro módulo deve chamar o cliente Supabase diretamente
— sempre passar por `Storage`. Isso permite migrar sem reescrever Dashboard,
Accounts, Goals, etc.

### Regra crítica — mudança de schema é sempre uma migration nova
Nunca editar `0001_init.sql`, `0002_...sql` ou `0003_...sql` depois de
aplicados. Qualquer alteração de schema vira um arquivo novo e numerado em
`supabase/migrations/` (ex.: `0004_algo.sql`), seguindo o padrão de
comentário de cabeçalho já usado nos três primeiros (o que faz + data).

### Schema aplicado (tabelas reais, uma por entidade)

| Tabela | Espelha (localStorage) | Observação |
|---|---|---|
| `perfil` | `meta` + `perfil` + `configuracoes` | 1 linha por usuário (PK = `user_id`) |
| `rendas` | `rendas[]` | |
| `cartoes` | `cartoes[]` | |
| `categorias` | `categorias[]` | PK composta (`user_id`, `nome`) |
| `despesas_recorrentes` | `despesasRecorrentes[]` | status: Pendente/Pago/Vencido |
| `despesas_variaveis` | `despesasVariaveis[]` | indexada por (`user_id`, `mes_referencia`) |
| `parcelamentos` | `parcelamentos[]` | FK opcional para `cartoes` |
| `metas` | `metas[]` | coluna de prazo é `prazo_meses` (não `prazo` — corrigido na 0003) |
| `investimentos` | — (schema novo, ainda não usado no app) | |
| `reserva_emergencia` | `reservaEmergencia` | 1 linha por usuário |
| `historico_mensal` | `historicoMensal[]` | PK composta (`user_id`, `mes`) |
| `pendencias` | `pendencias[]` | PK `bigint identity` |
| `inconsistencias_detectadas` | `inconsistenciasDetectadas[]` | PK `bigint identity` |

Convenção de ID: a maioria das tabelas usa `id text primary key` para manter
compatível o mesmo ID gerado no client (`generateId()` em storage.js) — não
trocar para `uuid`/`serial` sem necessidade real.

### RLS (Row Level Security) — já ativado em todas as tabelas
Todas têm uma única policy `"dono_do_registro"` (select/insert/update/delete)
usando `(select auth.uid()) = user_id` — a forma com `select` em vez de
`auth.uid()` direto é proposital (avaliação única por query em vez de por
linha; corrigido na 0002 a partir do advisor de performance do Supabase).
Qualquer tabela nova deve seguir esse mesmo padrão de policy desde a criação.

### Índices
`user_id` (e `cartao_id`/`mes_referencia` onde relevante) já está indexado em
todas as tabelas — ver 0001 e 0002. Ao criar tabela nova, adicionar índice em
qualquer FK/coluna usada em filtro por usuário.

### Já feito
- `js/storage.js` fala com Supabase (`load`/`save`/`exportJSON`/`clearAll`
  mantiveram a assinatura, só a implementação mudou)
- Rotina de migração no primeiro login: `Storage._buildFirstLoginSeed()`
  importa um backup local antigo (pré-Supabase) se existir em
  `localStorage['financas_app_v1']`, grava no Supabase e limpa a chave local
  (`Storage.load()`) — depois disso o app não lê mais aquele backup. Não há
  fallback duplo em uso normal: fora desse import único do primeiro acesso,
  toda leitura/escrita já vai direto pro Supabase.

### Pendente (ainda não implementado)
1. `comprovante` e `foto` hoje são salvos como base64 direto na tabela — no
   futuro, trocar por Supabase Storage (bucket privado) e guardar só a
   URL/path, para não estourar tamanho de linha nem o plano gratuito

## Autenticação

### Já funciona
- `login.html` + `js/auth.js` + `js/supabase-config.js`: login, cadastro e
  "esqueci minha senha" já implementados contra `supabaseClient.auth` de
  verdade (signInWithPassword, signUp, resetPasswordForEmail)
- Login/cadastro com Google (`js/auth.js` → `_handleGoogleAuth`, botão
  `#auth-google-btn` em `login.html`) via `supabaseClient.auth.signInWithOAuth
  ({ provider: 'google' })`, redirecionando de volta pra `index.html`.
  **Pendente de configuração manual**: o provedor Google precisa ser
  habilitado no painel do Supabase (Authentication → Providers → Google,
  com Client ID/Secret de um OAuth Client no Google Cloud Console) — sem
  isso o botão mostra o erro "provider is not enabled". Ver também as
  Redirect URLs em Authentication → URL Configuration (precisa incluir a
  URL onde `index.html` é servido).
- Em `login.html`, se já existe sessão válida, redireciona sozinho pra
  `index.html`
- `supabase-config.js` expõe `SUPABASE_URL` e a `publishable key` no client
  — isso é esperado/seguro (não é uma secret key), a proteção real é o RLS
  do banco. Não trocar isso por uma service role key no front-end.

### ✅ Auth guard implementado (dentro de js/app.js)
Resolvido. A lógica de guarda de sessão roda em `index.html`, dentro do
próprio `js/app.js` (não é um arquivo `auth-guard.js` separado — ficou
inline no ponto de entrada do app):
1. `requireAuth()` checa `supabaseClient.auth.getSession()` no
   `DOMContentLoaded`
2. Sem sessão → redireciona pra `login.html`
3. Com sessão → adiciona a classe `authed` na `<html>` (libera o app-shell)
4. `setupAccountSection()` preenche `#account-email` e liga
   `#account-logout-btn` (card "Conta", último item da tela de Perfil) e
   `#side-logout-btn` (rodapé fixo da sidebar, com confirmação) a
   `supabaseClient.auth.signOut()` + redirect pro login

Script leve, sem dependência dos outros módulos do app (Storage, Dashboard
etc.) — só precisa que os elementos do HTML já existam.

## Convenções de código

- Nomes de campos de dados em português, seguindo o padrão já existente
  (`despesasRecorrentes`, `rendaMensal`, `mesReferenciaAtual`)
- Funções de cálculo em `Calc` devem ser puras: recebem dados, devolvem
  valor, sem efeito colateral
- Mudança no formato dos dados exige incrementar `SCHEMA_VERSION` e
  atualizar a função `migrate()`
- Cores e espaçamentos: reutilizar as variáveis CSS já definidas em
  `:root` (`css/style.css`) — não hardcodar valores novos

## Layout / responsividade

- Breakpoints existentes: 480px, 640px, 860px
- O menu lateral (`.side-nav`) deve ficar ancorado à esquerda via CSS
  Grid (`.app-shell` com `grid-template-columns: 250px 1fr`) — **não**
  usar `margin: auto` no container que envolve a sidebar, isso já causou
  um bug de centralização corrigido anteriormente (ver comentário em
  `css/style.css` próximo à regra `.app-shell`)
- Conteúdo principal (`.app-main`) deve se adaptar ao espaço restante,
  nunca sobrepor o menu

## Definição de pronto (QA obrigatório antes de finalizar qualquer tarefa)

- [ ] Testado em desktop, tablet e mobile
- [ ] Menu lateral não sobrepõe conteúdo em nenhuma resolução
- [ ] Todo link/botão tem funcionalidade confirmada, não só visual
- [ ] App testado do zero (dados limpos) sem quebrar
- [ ] Se mexeu no schema de dados: `SCHEMA_VERSION` incrementado e
      `migrate()` atualizado

## Cuidado ao pedir correções

Antes de pedir para "corrigir" um bug de layout ou posicionamento,
confirmar que ele realmente está acontecendo (print/descrição do
comportamento atual). Vários bugs de responsividade e posicionamento do
menu já foram corrigidos — pedir uma correção às cegas pode fazer o
Claude reintroduzir um problema já resolvido.
