-- =====================================================================
-- 0013 — guardar TODA publicação coletada, não só as que viram decisão
-- =====================================================================
-- A coleta por vara lia 272 publicações, reconhecia 40 como sentença e
-- jogava fora as outras 232. Quem buscava ficava sem nada: as descartadas
-- só existiam durante a execução, e não havia tela onde encontrá-las.
--
-- Isso confundia duas coisas diferentes:
--
--   publicacao — o que o diário publicou. Todas entram.
--   decisao    — o que reconhecemos como julgamento. Só as que passam.
--
-- A tabela `publicacao` já existia para as intimações do escritório, com
-- busca no teor e tudo. Faltava a coleta escrever nela.
--
-- A coluna `coletada` separa as duas populações. Sem ela, 272 publicações
-- de terceiros cairiam no mesmo lugar onde se controla prazo do
-- escritório — e prazo perdido por ruído de tela é dano real.
-- =====================================================================

alter table publicacao
  add column if not exists coletada boolean not null default false;

comment on column publicacao.coletada is
  'true = trazida pela coleta por vara (processo de terceiro, sem prazo a controlar). '
  'false = publicação dos processos do escritório.';

-- O padrão da tela de Publicações é mostrar só as do escritório, então o
-- índice serve à consulta mais frequente.
create index if not exists idx_publicacao_coletada
  on publicacao (coletada, data_disponibilizacao desc);

-- ---------------------------------------------------------------------
-- Publicação coletada não tem prazo do escritório: ninguém precisa
-- recorrer de sentença de terceiro. Deixar `lida = false` faria o contador
-- de não lidas do painel subir às centenas sem nenhuma providência
-- possível.
-- ---------------------------------------------------------------------
update publicacao set lida = true, prazo_dias = null, prazo_fatal = null
where coletada and (not lida or prazo_dias is not null);
