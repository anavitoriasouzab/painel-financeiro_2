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

### Regra crítica — toda tabela de array usa substituição ATÔMICA
`Storage._writeAll()` apaga e reinsere cada tabela de array a cada save. Para
as tabelas que importam isso é feito por uma função no Postgres
(`replace_*`, ver `rpcReplace` em ARRAY_TABLES), que faz delete+insert numa
transação só — se o insert falhar, o delete desfaz junto. Sem isso, uma falha
no meio (rede, aba fechada, constraint) deixa a tabela VAZIA. Hoje têm
proteção: `rendas`, `despesas_recorrentes`, `despesas_variaveis` e
`parcelamentos`. Tabela nova que guarde algo que a pessoa não possa perder
nasce com a sua `replace_*` junto.

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

### Imagens (comprovante de despesa e foto de perfil)
Ficam no bucket privado `imagens` do Supabase Storage (migration 0015), não
mais em base64 dentro da linha. As colunas `despesas_variaveis.comprovante` e
`perfil.foto` continuam `text` e continuam sendo a única referência — o que
mudou é o CONTEÚDO: guardam o path `<user_id>/<tipo>/<arquivo>`.

- O primeiro segmento do path PRECISA ser o `user_id`: é nele que as policies
  do bucket se apoiam (`storage.foldername(name)[1]`), do mesmo jeito que a
  coluna `user_id` nas tabelas
- O bucket é privado; exibir uma imagem é sempre `Storage.imageSrc(valor)`,
  que devolve URL assinada (cacheada ~50min). Nunca montar URL pública
- Valor começando com `data:` é o formato ANTIGO e continua sendo exibido
  normalmente — `Storage.migrateBase64Images()` roda no fim do `initApp` e
  converte o que sobrou, de forma idempotente e sem derrubar nada se falhar
- Quem troca/remove/exclui uma imagem tem que chamar `Storage.removeImage()`
  no objeto antigo, senão ele fica órfão no bucket pra sempre. O upload só
  acontece no SALVAR (escolher arquivo e cancelar não pode subir nada)
- O backup JSON volta a embutir as imagens em base64 na exportação
  (`Backup.exportJSON`): um path não faz sentido em outra conta, que nem
  permissão de ler aquele objeto tem

## Autenticação

### Já funciona
- `login.html` + `js/auth.js` + `js/supabase-config.js`: login, cadastro e
  "esqueci minha senha" já implementados contra `supabaseClient.auth` de
  verdade (signInWithPassword, signUp, resetPasswordForEmail)
- Login/cadastro com Google (`js/auth.js` → `_handleGoogleAuth`, botão
  `#auth-google-btn` em `login.html`) via `supabaseClient.auth.signInWithOAuth
  ({ provider: 'google' })`, redirecionando de volta pra `index.html`.
  **✅ Configurado e funcionando**: provedor Google habilitado no painel do
  Supabase (Authentication → Providers → Google, com Client ID/Secret de um
  OAuth Client no Google Cloud Console) e Redirect URLs configuradas em
  Authentication → URL Configuration. Cadastro/login com Google testado e
  funcionando (contas criadas normalmente).
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
4. `setupAccountSection()` liga `#side-logout-btn` (rodapé fixo da sidebar,
   com confirmação) a `supabaseClient.auth.signOut()` + redirect pro login
   — único botão de logout do app (o card "Conta" que existia no fim da
   tela de Perfil, com email + logout sem confirmação, foi removido por
   ser redundante)

Script leve, sem dependência dos outros módulos do app (Storage, Dashboard
etc.) — só precisa que os elementos do HTML já existam.

## Convenções de código

- Nomes de campos de dados em português, seguindo o padrão já existente
  (`despesasRecorrentes`, `rendaMensal`, `mesReferenciaAtual`)
- Funções de cálculo em `Calc` devem ser puras: recebem dados, devolvem
  valor, sem efeito colateral
- Mudança no formato dos dados exige incrementar `SCHEMA_VERSION` e
  atualizar a função `migrate()`
- Parcelamento só pode ser somado num mês em que ele é de fato cobrado —
  sempre filtrar por `Calc.activeInstallmentsForMonth(data, mes)`, nunca
  varrer `data.parcelamentos` direto num cálculo que tem um mês de
  referência. Sem isso, parcela encerrada continua contando nos meses
  seguintes e o total de uma categoria deixa de bater com a soma das
  linhas daquele mês
- O % de "renda comprometida" é só do mês corrente, de propósito. O que já
  está contratado para os meses seguintes é um número separado
  (`Calc.calculateFutureCommitments`) — não misturar os dois num
  percentual só, isso criaria um comprometimento que nenhum mês tem
- Compra parcelada NÃO vira despesa variável: o formulário de despesa
  (marcando "Foi uma compra parcelada") grava um item em `parcelamentos`,
  dividindo o valor TOTAL digitado pelo nº de vezes — ver
  `Accounts._submitAsInstallment`. É `parcelamentos` que já sabe cobrar só a
  parcela mês a mês; duplicar essa lógica nas variáveis faria o valor cheio
  pesar num mês só
- O bloco "foi parcelada" aparece em QUALQUER despesa única (não exige forma
  de pagamento "cartão"). Exigir escondia a opção na maioria das despesas já
  cadastradas, que nasceram sem forma de pagamento — a pessoa abria pra
  marcar e não achava nada. Parcelamento aqui não depende de cartão:
  `cartaoId` é nullable, e só é preenchido quando a compra foi mesmo no
  cartão; só nesse caso o dia de fechamento pode empurrar a 1ª parcela pro
  mês seguinte
- Converter é um MOVE entre duas tabelas, então checar duplicata ANTES de
  mexer em qualquer coisa: `parcelamentos_sem_duplicata` (nome + categoria +
  valor da parcela + parcelas restantes) faria o insert estourar só na
  gravação, com a despesa já apagada. A mesma checagem existe nos dois
  formulários (`Accounts._submitAsInstallment` e `Installments._doSubmitForm`)
- O mesmo vale ao EDITAR uma despesa variável já cadastrada: marcar
  "parcelada" CONVERTE o lançamento (apaga a despesa, cria o parcelamento).
  A conversão pede confirmação porque `parcelamentos` não tem
  comprovante/status/data, e sem data informada usa o `mesReferencia` da
  despesa original como mês da 1ª parcela — nunca o mês corrente, senão uma
  compra de agosto convertida em setembro duraria um mês a mais que a fatura
- No formulário de parcelamento dá pra informar o valor "da parcela" ou
  "total da compra" (`Installments.valorModo`) — o segundo divide pelo total
  de parcelas, que é o que permite corrigir "em quantas vezes" numa compra já
  cadastrada sem recalcular a parcela na mão. O que fica GRAVADO é sempre
  `valorParcela`; o modo é só de entrada e reabre em "parcela" a cada edição
- `parcelaAtual`/`parcelasRestantes` são sempre relativos ao
  `mesReferenciaAtual`, nunca à data da compra. Uma compra cuja 1ª parcela
  só cai na fatura do mês que vem se escreve como `parcelaAtual: 0`
  (`Calc.calculateInstallmentActiveRange` lê isso como "começa no mês
  seguinte"); uma de meses atrás nasce com `parcelaAtual` já adiantada
- `inconsistenciasDetectadas` é a única fonte de lembrete que NÃO é
  recalculada a partir dos dados — por isso dispensá-la tem que gravar
  `resolvida: true` via `Storage` (ver `Dashboard._resolveInconsistencyIfAny`),
  e não só no estado local de notificações, que é escopado ao mês e volta
  na virada
- `historicoMensal` guarda só mês FECHADO. O mês corrente nunca sai de lá:
  toda tela que precise dele usa `Calc.historicoComMesAtual(data)`, que
  recalcula ao vivo. Um snapshot do mês em andamento congela um número que
  ainda vai mudar — foi o que fez gráficos e tabela mostrarem um gasto menor
  que os cartões do topo. Para a média de meses fechados existe
  `Calc.historicoArquivado(data)`
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
- A `.bottom-nav` tem 5 itens e os rótulos por extenso. Não cabe um 6º:
  com 6, "Planejamento" precisa de ~66px e em 320px sobram ~46px por item.
  Perfil é alcançado pelo avatar do header, não pela barra (já foi tentado
  como 6º item e desfeito)
- `env(safe-area-inset-bottom)` SOMA na altura da `.bottom-nav`, nunca é
  só `padding-bottom` sobre uma altura fixa: com o `box-sizing: border-box`
  global, o inset seria descontado dos 68px e esmagaria ícone+rótulo no app
  instalado (era a diferença que aparecia entre o app e o site). Quem
  reserva espaço pra barra (`body`, `.toast`) precisa somar o inset também

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
