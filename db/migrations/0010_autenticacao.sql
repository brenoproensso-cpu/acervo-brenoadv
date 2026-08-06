-- =====================================================================
-- 0010_autenticacao.sql — usuários e sessões
-- =====================================================================
-- O sistema passa a ser exposto na internet, então o acesso deixa de ser
-- "quem está na rede do escritório" e vira "quem tem credencial".
--
-- A senha é guardada como hash scrypt com sal por usuário. O token de
-- sessão também é guardado em hash: se o banco vazar, os tokens gravados
-- não servem para entrar em conta nenhuma.
-- =====================================================================

do $$ begin
  create type papel_usuario as enum (
    'administrador',   -- gerencia usuários
    'advogado',        -- acesso completo ao acervo
    'colaborador'      -- consulta e conferência, sem gerenciar usuários
  );
exception when duplicate_object then null; end $$;

create table if not exists usuario (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  nome              text not null,
  senha_hash        text not null,
  senha_sal         text not null,
  papel             papel_usuario not null default 'colaborador',
  ativo             boolean not null default true,
  ultimo_acesso     timestamptz,
  -- Trava de força bruta: contagem de erros e bloqueio temporário.
  tentativas_falhas integer not null default 0,
  bloqueado_ate     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- E-mail é comparado sempre em minúsculas.
  constraint usuario_email_key unique (email)
);

create index if not exists idx_usuario_ativo on usuario (ativo);

-- ---------------------------------------------------------------------
-- Sessões. O cookie leva o token em claro; aqui fica só o hash dele.
-- ---------------------------------------------------------------------
create table if not exists sessao (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references usuario (id) on delete cascade,
  token_hash   text not null,
  expira_em    timestamptz not null,
  criada_em    timestamptz not null default now(),
  ultimo_uso   timestamptz not null default now(),
  user_agent   text,
  ip           text,
  constraint sessao_token_hash_key unique (token_hash)
);

create index if not exists idx_sessao_usuario on sessao (usuario_id);
create index if not exists idx_sessao_expira on sessao (expira_em);

-- ---------------------------------------------------------------------
-- Trilha de acesso. Num sistema com dado sensível de saúde, saber quem
-- entrou e quando deixa de ser luxo.
-- ---------------------------------------------------------------------
create table if not exists log_acesso (
  id          bigserial primary key,
  usuario_id  uuid references usuario (id) on delete set null,
  email       text,
  evento      text not null,   -- 'login_ok', 'login_falha', 'logout', 'bloqueio'
  ip          text,
  user_agent  text,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_log_acesso_data on log_acesso (criado_em desc);
create index if not exists idx_log_acesso_usuario on log_acesso (usuario_id);

-- ---------------------------------------------------------------------
-- Limpeza de sessões vencidas. Chamada no login, para não precisar de
-- job agendado.
-- ---------------------------------------------------------------------
create or replace function limpar_sessoes_vencidas()
returns void
language sql
as $$
  delete from sessao where expira_em < now();
$$;

drop trigger if exists set_updated_at on usuario;
create trigger set_updated_at before update on usuario
  for each row execute function tg_set_updated_at();
