-- =============================================================================
-- Painel Financeiro — schema inicial para Supabase (Postgres)
-- -----------------------------------------------------------------------------
-- Espelha 1:1 a estrutura de `appData` hoje guardada em localStorage
-- (ver js/storage.js — buildSeedData / migrate). Cada tabela corresponde a um
-- array ou objeto do JSON atual. Tudo é isolado por usuário via `user_id` +
-- Row Level Security, para que múltiplos usuários possam usar o mesmo projeto
-- Supabase sem ver os dados uns dos outros.
--
-- Aplicado em 2026-08-22 no projeto Supabase "anavitoriasouzab's Project"
-- (ref: bgconighgmkibezllirw, região ca-central-1) via migration
-- "init_painel_financeiro_schema". Ver também 0002_optimize_rls_and_fk_indexes.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Config/meta/perfil (1 linha por usuário — substitui `meta`, `perfil` e
-- `configuracoes` do JSON atual)
-- -----------------------------------------------------------------------------
create table public.perfil (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  mes_referencia_atual text not null,              -- 'YYYY-MM'
  nome text,
  foto text,                                        -- base64 ou URL (Supabase Storage no futuro)

  dia_recebimento_salario int,
  ciclo_financeiro text,
  margem_seguranca numeric(12,2),
  meta_economia_mensal numeric(12,2),

  limite_comprometimento_percentual numeric(5,2) not null default 80,
  limite_comprometimento_modo text not null default 'confirmacao'
    check (limite_comprometimento_modo in ('aviso', 'confirmacao', 'bloqueio')),

  notificacoes_ativado boolean not null default false,
  notificacoes_canais text[] not null default '{}',

  ocultar_valor_renda boolean not null default false,
  ocultar_valor_saldo boolean not null default false
);

-- -----------------------------------------------------------------------------
-- rendas[]
-- -----------------------------------------------------------------------------
create table public.rendas (
  id text primary key,                              -- mantém os IDs client-side (ex.: 'renda-1')
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  valor numeric(12,2) not null,
  frequencia text not null default 'mensal',
  dia_recebimento int,
  observacao text,
  criado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- cartoes[]
-- -----------------------------------------------------------------------------
create table public.cartoes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  limite numeric(12,2),
  limite_disponivel numeric(12,2),
  dia_fechamento int,
  dia_vencimento int,
  valor_fatura_atual numeric(12,2)
);

-- -----------------------------------------------------------------------------
-- categorias[] (lista simples por usuário)
-- -----------------------------------------------------------------------------
create table public.categorias (
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  primary key (user_id, nome)
);

-- -----------------------------------------------------------------------------
-- despesasRecorrentes[]
-- -----------------------------------------------------------------------------
create table public.despesas_recorrentes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  valor numeric(12,2) not null,
  frequencia text not null default 'mensal',
  vencimento text,                                  -- texto livre, ex.: 'dia 05'
  categoria text,
  tipo text,                                         -- 'fixa' | 'assinatura' | ...
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Pago', 'Vencido')),
  comprovante text,                                  -- base64 (ou URL futura no Storage)
  observacao text
);

-- -----------------------------------------------------------------------------
-- despesasVariaveis[]
-- -----------------------------------------------------------------------------
create table public.despesas_variaveis (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  valor numeric(12,2) not null,
  categoria text,
  data date,
  mes_referencia text not null,                      -- 'YYYY-MM'
  forma_pagamento text,
  status text not null default 'Pago'
    check (status in ('Pendente', 'Pago', 'Vencido')),
  comprovante text,
  observacao text
);

-- -----------------------------------------------------------------------------
-- parcelamentos[]
-- -----------------------------------------------------------------------------
create table public.parcelamentos (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cartao_id text references public.cartoes(id) on delete set null,
  nome text not null,
  valor_parcela numeric(12,2) not null,
  total_parcelas int,
  parcela_atual int,
  parcelas_restantes int not null default 0,
  data_primeira_parcela date,
  categoria text,
  status_descricao text,                             -- ex.: 'última parcela'
  observacao text
);

-- -----------------------------------------------------------------------------
-- metas[]
-- -----------------------------------------------------------------------------
create table public.metas (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null default 'valor' check (tipo in ('valor', 'habito')),
  valor_desejado numeric(12,2),
  valor_mensal_desejado numeric(12,2),
  valor_atual numeric(12,2),
  prazo int,                                         -- meses
  prioridade text not null default 'média' check (prioridade in ('alta', 'média', 'baixa')),
  destaque boolean not null default false,           -- mostrar no menu lateral (máx. 2, validado em app)
  observacao text
);

-- -----------------------------------------------------------------------------
-- investimentos[] (estrutura ainda vazia no app hoje — schema preparado)
-- -----------------------------------------------------------------------------
create table public.investimentos (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo text,
  valor_atual numeric(12,2),
  observacao text
);

-- -----------------------------------------------------------------------------
-- reservaEmergencia (1 linha por usuário)
-- -----------------------------------------------------------------------------
create table public.reserva_emergencia (
  user_id uuid primary key references auth.users(id) on delete cascade,
  possui boolean,
  valor_atual numeric(12,2),
  meta_valor numeric(12,2),
  valor_mensal_destinado numeric(12,2)
);

-- -----------------------------------------------------------------------------
-- historicoMensal[] (snapshots calculados — ver Storage.buildSnapshot)
-- -----------------------------------------------------------------------------
create table public.historico_mensal (
  user_id uuid not null references auth.users(id) on delete cascade,
  mes text not null,                                 -- 'YYYY-MM'
  renda numeric(12,2) not null,
  gastos numeric(12,2) not null,
  saldo numeric(12,2) not null,
  percentual_comprometido numeric(6,2) not null,
  potencial_investimento numeric(12,2) not null,
  registrado_em timestamptz not null default now(),
  primary key (user_id, mes)
);

-- -----------------------------------------------------------------------------
-- pendencias[] e inconsistenciasDetectadas[]
-- -----------------------------------------------------------------------------
create table public.pendencias (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  descricao text not null,
  criado_em timestamptz not null default now()
);

create table public.inconsistencias_detectadas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  descricao text not null,
  resolvida boolean not null default false,
  criado_em timestamptz not null default now()
);

-- =============================================================================
-- Índices úteis (consultas mais comuns: por usuário + mês)
-- =============================================================================
create index idx_despesas_variaveis_user_mes on public.despesas_variaveis (user_id, mes_referencia);
create index idx_historico_mensal_user on public.historico_mensal (user_id, mes);
create index idx_parcelamentos_user on public.parcelamentos (user_id);
create index idx_despesas_recorrentes_user on public.despesas_recorrentes (user_id);

-- =============================================================================
-- Row Level Security — cada usuário só enxerga e edita as próprias linhas
-- =============================================================================
alter table public.perfil enable row level security;
alter table public.rendas enable row level security;
alter table public.cartoes enable row level security;
alter table public.categorias enable row level security;
alter table public.despesas_recorrentes enable row level security;
alter table public.despesas_variaveis enable row level security;
alter table public.parcelamentos enable row level security;
alter table public.metas enable row level security;
alter table public.investimentos enable row level security;
alter table public.reserva_emergencia enable row level security;
alter table public.historico_mensal enable row level security;
alter table public.pendencias enable row level security;
alter table public.inconsistencias_detectadas enable row level security;

-- Uma policy genérica "dono do registro" por tabela (select/insert/update/delete)
do $$
declare
  t text;
begin
  foreach t in array array[
    'perfil', 'rendas', 'cartoes', 'categorias', 'despesas_recorrentes',
    'despesas_variaveis', 'parcelamentos', 'metas', 'investimentos',
    'reserva_emergencia', 'historico_mensal', 'pendencias', 'inconsistencias_detectadas'
  ]
  loop
    execute format(
      'create policy "dono_do_registro" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t
    );
  end loop;
end $$;

-- =============================================================================
-- Observações para quando formos migrar de fato:
-- 1. Hoje o app é 100% client-side/localStorage (ver js/storage.js). Migrar
--    para Supabase significa reescrever só a camada `Storage` (load/save) para
--    chamar supabase-js em vez de localStorage — o resto do app (calculations,
--    dashboard, accounts etc.) não precisa mudar, pois já fala só com `Storage`.
-- 2. Os campos "comprovante"/"foto" hoje são base64 direto no JSON. Em produção
--    o ideal é trocar por Supabase Storage (bucket privado) e guardar só a
--    URL/path aqui — evita estourar o tamanho das linhas e do plano gratuito.
-- 3. `parcelasRestantes`/virada de mês (Planning.turnMonth) hoje é um cálculo
--    feito no client a cada "virar mês". Dá pra manter client-side com
--    Supabase também (só troca o save), ou mover para uma function/trigger
--    se algum dia precisar rodar server-side (ex.: lembretes por e-mail).
-- =============================================================================
