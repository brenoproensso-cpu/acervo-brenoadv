-- =====================================================================
-- 0003_acervo.sql — processo, laudo, decisão, peça
-- =====================================================================

-- ---------------------------------------------------------------------
-- Processo. Versão enxuta: é a âncora que liga laudo e decisão do mesmo
-- caso, o que a estatística exige. O módulo completo de andamentos e
-- prazos entra em fase posterior.
-- ---------------------------------------------------------------------
create table if not exists processo (
  id                 uuid primary key default gen_random_uuid(),
  numero_cnj         text,
  cliente_nome       text,
  cliente_iniciais   text,                 -- para casos em segredo de justiça
  segredo_justica    boolean not null default false,
  polo_escritorio    polo not null default 'ativo',
  orgao_julgador_id  uuid references orgao_julgador (id) on delete set null,
  magistrado_id      uuid references magistrado (id) on delete set null,
  beneficio_id       uuid references beneficio (id) on delete set null,
  uf                 char(2),
  data_distribuicao  date,
  data_der           date,                 -- data de entrada do requerimento
  valor_causa        numeric(14, 2),
  status             text default 'em_andamento',
  observacoes        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint processo_numero_cnj_key unique (numero_cnj)
);

create index if not exists idx_processo_orgao on processo (orgao_julgador_id);
create index if not exists idx_processo_magistrado on processo (magistrado_id);
create index if not exists idx_processo_beneficio on processo (beneficio_id);
create index if not exists idx_processo_cliente_trgm
  on processo using gin (cliente_nome gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Laudo pericial. Um processo pode ter mais de um (perito judicial,
-- assistente técnico, complementar), por isso é tabela própria.
-- ---------------------------------------------------------------------
create table if not exists laudo_pericial (
  id                      uuid primary key default gen_random_uuid(),
  processo_id             uuid not null references processo (id) on delete cascade,
  perito_id               uuid references perito (id) on delete set null,
  data_laudo              date,
  conclusao               conclusao_pericial,
  -- Derivada da conclusão, materializada para permitir índice e
  -- agregação direta sem repetir a regra em cada consulta.
  reconheceu_incapacidade boolean generated always as (
    conclusao_reconhece_incapacidade(conclusao)
  ) stored,
  cid_principal           text,
  cids                    text[] not null default '{}',
  dii                     date,            -- data de início da incapacidade
  dib_sugerida            date,            -- data de início do benefício sugerida
  reabilitavel            boolean,
  grau_incapacidade       text,            -- observação livre do perito
  resumo                  text,
  texto                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_laudo_processo on laudo_pericial (processo_id);
create index if not exists idx_laudo_perito on laudo_pericial (perito_id);
create index if not exists idx_laudo_conclusao on laudo_pericial (conclusao);
create index if not exists idx_laudo_reconheceu on laudo_pericial (reconheceu_incapacidade);
create index if not exists idx_laudo_cids on laudo_pericial using gin (cids);

-- ---------------------------------------------------------------------
-- Decisão. Guarda tanto o que saiu nos processos do escritório
-- (origem = acervo_proprio) quanto jurisprudência de referência
-- (origem = jurisprudencia_externa).
-- ---------------------------------------------------------------------
create table if not exists decisao (
  id                 uuid primary key default gen_random_uuid(),
  origem             origem_documento not null default 'acervo_proprio',
  tipo               tipo_documento not null default 'sentenca',
  titulo             text,
  processo_id        uuid references processo (id) on delete set null,
  numero_cnj         text,
  orgao_julgador_id  uuid references orgao_julgador (id) on delete set null,
  magistrado_id      uuid references magistrado (id) on delete set null,
  relator            text,
  tribunal           text,
  instancia          instancia not null default 'primeiro_grau',
  data_decisao       date,
  data_publicacao    date,
  resultado          resultado_julgamento,
  -- Preenchida pelo trigger a partir de resultado + polo quando nula,
  -- mas sobrescrevível: o enum não sabe quem foi o recorrente.
  favoravel          boolean,
  beneficio_id       uuid references beneficio (id) on delete set null,
  -- Nível de autoridade no padrão usado pela pesquisa jurisprudencial:
  -- A vinculante forte, B precedente qualificado, C órgão de cúpula,
  -- D orientativo, E editorial.
  nivel_autoridade   char(1) check (nivel_autoridade in ('A','B','C','D','E')),
  ementa             text,
  dispositivo        text,
  texto_integral     text,
  fonte              text,
  url_fonte          text,
  tags               text[] not null default '{}',
  observacoes        text,
  tsv                tsvector,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_decisao_origem on decisao (origem);
create index if not exists idx_decisao_tipo on decisao (tipo);
create index if not exists idx_decisao_resultado on decisao (resultado);
create index if not exists idx_decisao_favoravel on decisao (favoravel);
create index if not exists idx_decisao_processo on decisao (processo_id);
create index if not exists idx_decisao_orgao on decisao (orgao_julgador_id);
create index if not exists idx_decisao_magistrado on decisao (magistrado_id);
create index if not exists idx_decisao_beneficio on decisao (beneficio_id);
create index if not exists idx_decisao_data on decisao (data_decisao desc);
create index if not exists idx_decisao_tags on decisao using gin (tags);

-- ---------------------------------------------------------------------
-- Preenche favoravel quando o cadastro não informou, usando o polo do
-- processo (ativo por padrão para jurisprudência solta).
-- ---------------------------------------------------------------------
create or replace function tg_decisao_favoravel()
returns trigger
language plpgsql
as $$
declare
  p polo := 'ativo';
begin
  if new.favoravel is null and new.resultado is not null then
    if new.processo_id is not null then
      select polo_escritorio into p from processo where id = new.processo_id;
    end if;
    new.favoravel := resultado_e_favoravel(new.resultado, coalesce(p, 'ativo'));
  end if;
  return new;
end;
$$;

drop trigger if exists set_favoravel on decisao;
create trigger set_favoravel
  before insert or update of resultado, processo_id on decisao
  for each row execute function tg_decisao_favoravel();

-- ---------------------------------------------------------------------
-- Peça: o acervo de modelos e petições já produzidos.
-- ---------------------------------------------------------------------
create table if not exists peca (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  tipo          tipo_peca not null default 'peticao_inicial',
  processo_id   uuid references processo (id) on delete set null,
  beneficio_id  uuid references beneficio (id) on delete set null,
  autor         text,                      -- quem redigiu
  data_peca     date,
  modelo        boolean not null default false,  -- serve de template?
  resumo        text,
  texto         text,
  tags          text[] not null default '{}',
  observacoes   text,
  tsv           tsvector,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_peca_tipo on peca (tipo);
create index if not exists idx_peca_modelo on peca (modelo);
create index if not exists idx_peca_processo on peca (processo_id);
create index if not exists idx_peca_beneficio on peca (beneficio_id);
create index if not exists idx_peca_data on peca (data_peca desc);
create index if not exists idx_peca_tags on peca using gin (tags);

-- ---------------------------------------------------------------------
-- Vínculos n:n com teses
-- ---------------------------------------------------------------------
create table if not exists decisao_tese (
  decisao_id  uuid not null references decisao (id) on delete cascade,
  tese_id     uuid not null references tese (id) on delete cascade,
  -- A decisão acolheu a tese? Permite medir aceitação, não só menção.
  acolhida    boolean,
  primary key (decisao_id, tese_id)
);

create index if not exists idx_decisao_tese_tese on decisao_tese (tese_id);

create table if not exists peca_tese (
  peca_id  uuid not null references peca (id) on delete cascade,
  tese_id  uuid not null references tese (id) on delete cascade,
  primary key (peca_id, tese_id)
);

create index if not exists idx_peca_tese_tese on peca_tese (tese_id);

-- ---------------------------------------------------------------------
-- Arquivos anexos (PDF do inteiro teor, DOCX da peça, laudo digitalizado).
-- Guarda só o ponteiro; o binário fica no disco ou no bucket.
-- ---------------------------------------------------------------------
create table if not exists arquivo (
  id            uuid primary key default gen_random_uuid(),
  entidade      text not null check (entidade in ('decisao', 'peca', 'laudo_pericial', 'processo')),
  entidade_id   uuid not null,
  nome          text not null,
  mime          text,
  tamanho_bytes bigint,
  storage_path  text not null,
  sha256        text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_arquivo_entidade on arquivo (entidade, entidade_id);
create index if not exists idx_arquivo_sha on arquivo (sha256);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['processo', 'laudo_pericial', 'decisao', 'peca']
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I;
       create trigger set_updated_at before update on %I
         for each row execute function tg_set_updated_at();', t, t);
  end loop;
end $$;
