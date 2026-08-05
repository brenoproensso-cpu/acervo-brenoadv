-- =====================================================================
-- seed.sql — carga de demonstração
-- =====================================================================
-- ATENÇÃO: todo o conteúdo deste arquivo é SINTÉTICO. Clientes, peritos,
-- magistrados, números de processo e ementas são inventados e existem
-- apenas para o painel de padrões ter o que exibir antes da carga real.
-- Nenhum acórdão aqui pode ser citado em peça. Rode `npm run db:reset`
-- sem `--seed` para começar com a base vazia.
-- =====================================================================

begin;

truncate table decisao_tese, peca_tese, arquivo, decisao, peca,
               laudo_pericial, processo, magistrado, perito,
               orgao_julgador, beneficio, tese restart identity cascade;

-- Torna a carga reprodutível: mesma semente, mesmos números.
select setseed(0.4242);

-- ---------------------------------------------------------------------
-- Benefícios
-- ---------------------------------------------------------------------
insert into beneficio (codigo, nome, descricao) values
  ('B31', 'Auxílio por Incapacidade Temporária', 'Antigo auxílio-doença previdenciário'),
  ('B91', 'Auxílio por Incapacidade Temporária Acidentário', 'Espécie acidentária'),
  ('B32', 'Aposentadoria por Incapacidade Permanente', 'Antiga aposentadoria por invalidez'),
  ('B94', 'Auxílio-Acidente', 'Sequela que reduz a capacidade laborativa'),
  ('B87', 'BPC/LOAS — Pessoa com Deficiência', 'Impedimento de longo prazo + critério de miserabilidade'),
  ('B88', 'BPC/LOAS — Idoso', 'Idoso com 65 anos ou mais');

-- ---------------------------------------------------------------------
-- Teses
-- ---------------------------------------------------------------------
insert into tese (nome, descricao) values
  ('Incapacidade parcial + condições pessoais',
   'Súmula 47 TNU: incapacidade parcial somada a idade, escolaridade e histórico laboral autoriza benefício por incapacidade permanente'),
  ('Reafirmação da DER',
   'Tema 995/STJ: possibilidade de reafirmação da DER para o momento em que implementados os requisitos'),
  ('DII fixada em perícia x DER anterior',
   'Fixação do termo inicial na cessação administrativa quando a DII é anterior à DER'),
  ('Desnecessidade de prévio requerimento administrativo',
   'Tema 350/STF: dispensa do requerimento em caso de notória resistência do INSS'),
  ('Miserabilidade por outros meios de prova',
   'Superação do critério de 1/4 do salário mínimo por avaliação socioeconômica do caso concreto'),
  ('Impugnação de laudo por especialidade diversa',
   'Nulidade da perícia realizada por profissional de especialidade incompatível com a patologia alegada'),
  ('Restabelecimento sem alta programada',
   'Ilegalidade da cessação por alta programada sem nova avaliação pericial'),
  ('Auxílio-acidente cumulável com aposentadoria',
   'Cumulação para benefícios anteriores à Lei 9.528/97'),
  ('Incapacidade omniprofissional em segurado idoso',
   'Impossibilidade de reabilitação diante da idade avançada'),
  ('Nulidade por cerceamento de defesa — quesitos não respondidos',
   'Ausência de resposta aos quesitos do autor como vício do laudo');

-- ---------------------------------------------------------------------
-- Órgãos julgadores
-- ---------------------------------------------------------------------
insert into orgao_julgador (nome, tipo, tribunal, comarca, uf, instancia) values
  ('1ª Vara Federal de Sorocaba',              'Vara Federal',   'TRF3', 'Sorocaba',      'SP', 'primeiro_grau'),
  ('2ª Vara Federal de Sorocaba',              'Vara Federal',   'TRF3', 'Sorocaba',      'SP', 'primeiro_grau'),
  ('JEF de Sorocaba',                          'Juizado Especial Federal', 'TRF3', 'Sorocaba', 'SP', 'primeiro_grau'),
  ('JEF de Campinas',                          'Juizado Especial Federal', 'TRF3', 'Campinas', 'SP', 'primeiro_grau'),
  ('1ª Vara Federal de Itapetininga',          'Vara Federal',   'TRF3', 'Itapetininga',  'SP', 'primeiro_grau'),
  ('Vara Única de Tatuí',                      'Vara Estadual',  'TJSP', 'Tatuí',         'SP', 'primeiro_grau'),
  ('1ª Turma Recursal de São Paulo',           'Turma Recursal', 'TRF3', 'São Paulo',     'SP', 'turma_recursal'),
  ('2ª Turma Recursal de São Paulo',           'Turma Recursal', 'TRF3', 'São Paulo',     'SP', 'turma_recursal'),
  ('7ª Turma do TRF da 3ª Região',             'Turma',          'TRF3', 'São Paulo',     'SP', 'segundo_grau'),
  ('9ª Turma do TRF da 3ª Região',             'Turma',          'TRF3', 'São Paulo',     'SP', 'segundo_grau');

-- ---------------------------------------------------------------------
-- Magistrados
-- ---------------------------------------------------------------------
insert into magistrado (nome, orgao_julgador_id, cargo)
select v.nome, o.id, v.cargo
from (values
  ('Ana Lúcia Moreira Prado',    '1ª Vara Federal de Sorocaba',     'Juíza Federal'),
  ('Carlos Eduardo Bastos',      '2ª Vara Federal de Sorocaba',     'Juiz Federal'),
  ('Marina Salgado Ferreira',    'JEF de Sorocaba',                 'Juíza Federal'),
  ('Roberto Nunes Camargo',      'JEF de Campinas',                 'Juiz Federal'),
  ('Helena Vasconcelos Pires',   '1ª Vara Federal de Itapetininga', 'Juíza Federal'),
  ('Paulo Sérgio Almeida',       'Vara Única de Tatuí',             'Juiz de Direito'),
  ('Tereza Cristina Lopes',      '1ª Turma Recursal de São Paulo',  'Juíza Relatora'),
  ('Fernando Duarte Ribeiro',    '2ª Turma Recursal de São Paulo',  'Juiz Relator'),
  ('Sílvia Mendes Rocha',        '7ª Turma do TRF da 3ª Região',    'Desembargadora Federal'),
  ('Gustavo Henrique Teixeira',  '9ª Turma do TRF da 3ª Região',    'Desembargador Federal')
) as v(nome, orgao, cargo)
join orgao_julgador o on o.nome = v.orgao;

-- ---------------------------------------------------------------------
-- Peritos
-- ---------------------------------------------------------------------
insert into perito (nome, tipo, especialidade, crm, uf, observacoes) values
  ('Dr. Márcio Aguiar Fontes',      'judicial', 'Ortopedia',    'CRM-SP 84.221', 'SP', 'Perfil restritivo em lombalgia; costuma concluir por capacidade residual.'),
  ('Dra. Renata Bicudo Lima',       'judicial', 'Psiquiatria',  'CRM-SP 91.507', 'SP', 'Boa aderência aos quesitos do autor; detalha limitações funcionais.'),
  ('Dr. Otávio Freire Rangel',      'judicial', 'Clínica Geral','CRM-SP 72.310', 'SP', 'Laudos sucintos; costuma pedir esclarecimentos complementares.'),
  ('Dra. Cláudia Nakamura',         'judicial', 'Reumatologia', 'CRM-SP 88.940', 'SP', 'Reconhece incapacidade parcial com frequência; atenção à DII.'),
  ('Dr. Ricardo Sampaio Vieira',    'judicial', 'Ortopedia',    'CRM-SP 65.118', 'SP', 'Historicamente restritivo. Vale impugnar e requerer complementação.'),
  ('Dra. Beatriz Coelho Martins',   'judicial', 'Neurologia',   'CRM-SP 95.702', 'SP', 'Fundamentação técnica sólida; laudos raramente reformados.'),
  ('Dr. Anderson Prata Guimarães',  'judicial', 'Cardiologia',  'CRM-SP 70.883', 'SP', 'Poucos casos no acervo.'),
  ('Dra. Juliana Peixoto Serra',    'judicial', 'Psiquiatria',  'CRM-SP 99.014', 'SP', 'Costuma fixar DII na data do primeiro afastamento documentado.'),
  ('Dr. Luiz Fernando Barreto',     'judicial', 'Ortopedia',    'CRM-SP 61.442', 'SP', 'Aceita bem quesitos suplementares sobre esforço repetitivo.'),
  ('Dra. Patrícia Rezende Alves',   'judicial', 'Assistência Social', 'CRESS-SP 44.120', 'SP', 'Perícia socioeconômica para BPC/LOAS.'),
  ('Dr. Eduardo Machado Nunes',     'assistente_tecnico', 'Ortopedia', 'CRM-SP 77.005', 'SP', 'Assistente técnico do escritório.'),
  ('Dra. Carolina Vieira Duarte',   'assistente_tecnico', 'Psiquiatria', 'CRM-SP 90.331', 'SP', 'Assistente técnica do escritório.');

-- =====================================================================
-- Casos: processo + laudo + decisão, com correlação intencional.
-- Cada perito recebe um perfil (probabilidade de reconhecer incapacidade
-- e taxa de êxito conforme a conclusão), de modo que o painel exiba
-- diferenças reais entre peritos em vez de ruído aleatório.
-- =====================================================================

create temporary table _perfil_perito on commit drop as
select
  p.id as perito_id,
  v.p_reconhece,
  v.p_exito_com,     -- êxito quando o laudo reconhece incapacidade
  v.p_exito_sem,     -- êxito quando o laudo NÃO reconhece
  v.peso             -- volume relativo de casos
from (values
  ('Dr. Márcio Aguiar Fontes',     0.32, 0.88, 0.14, 14),
  ('Dra. Renata Bicudo Lima',      0.66, 0.93, 0.34, 12),
  ('Dr. Otávio Freire Rangel',     0.48, 0.85, 0.20, 10),
  ('Dra. Cláudia Nakamura',        0.71, 0.90, 0.30,  9),
  ('Dr. Ricardo Sampaio Vieira',   0.24, 0.82, 0.09, 13),
  ('Dra. Beatriz Coelho Martins',  0.55, 0.95, 0.12,  8),
  ('Dr. Anderson Prata Guimarães', 0.50, 0.86, 0.22,  3),
  ('Dra. Juliana Peixoto Serra',   0.63, 0.91, 0.28,  8),
  ('Dr. Luiz Fernando Barreto',    0.44, 0.87, 0.18,  7),
  ('Dra. Patrícia Rezende Alves',  0.68, 0.89, 0.25,  6)
) as v(nome, p_reconhece, p_exito_com, p_exito_sem, peso)
join perito p on p.nome = v.nome and p.tipo = 'judicial';

-- Viés por juízo, somado à probabilidade de êxito do caso.
create temporary table _perfil_magistrado on commit drop as
select m.id as magistrado_id, v.bias
from (values
  ('Ana Lúcia Moreira Prado',    0.06),
  ('Carlos Eduardo Bastos',     -0.09),
  ('Marina Salgado Ferreira',    0.11),
  ('Roberto Nunes Camargo',      0.02),
  ('Helena Vasconcelos Pires',  -0.04),
  ('Paulo Sérgio Almeida',      -0.12),
  ('Tereza Cristina Lopes',      0.08),
  ('Fernando Duarte Ribeiro',   -0.03),
  ('Sílvia Mendes Rocha',        0.05),
  ('Gustavo Henrique Teixeira',  0.00)
) as v(nome, bias)
join magistrado m on m.nome = v.nome;

do $$
declare
  -- Sorteio ponderado: cada perito aparece na urna conforme seu peso.
  urna_peritos uuid[];
  r             record;
  i             int;
  n_casos       int := 140;

  v_perito      uuid;
  v_perfil      record;
  v_magistrado  uuid;
  v_orgao       uuid;
  v_beneficio   uuid;
  v_processo    uuid;
  v_decisao     uuid;

  reconhece     boolean;
  conclusao_v   conclusao_pericial;
  p_exito       numeric;
  foi_favoravel boolean;
  resultado_v   resultado_julgamento;
  data_dist     date;
  data_laudo_v  date;
  data_dec      date;
  bene_codigo   text;
  nomes         text[] := array[
    'Adriana','Benedito','Cleusa','Domingos','Edna','Fábio','Geralda','Hélio','Ivone','Joaquim',
    'Kátia','Lourdes','Manoel','Neusa','Osvaldo','Pedro','Quitéria','Rosa','Sebastião','Terezinha',
    'Ubirajara','Vanda','Wilson','Zilda','Antônio','Marlene','Nilton','Sônia','Valdir','Célia'];
  sobrenomes    text[] := array[
    'da Silva','Oliveira','Souza','Rodrigues','Ferreira','Almeida','Pereira','Lima','Gomes','Costa',
    'Ribeiro','Martins','Carvalho','Rocha','Dias','Nunes','Moreira','Cardoso','Teixeira','Barbosa'];
begin
  select array_agg(perito_id)
    into urna_peritos
  from _perfil_perito, generate_series(1, peso);

  for i in 1..n_casos loop
    v_perito := urna_peritos[1 + floor(random() * array_length(urna_peritos, 1))::int];
    select * into v_perfil from _perfil_perito where perito_id = v_perito;

    select m.magistrado_id, mg.orgao_julgador_id
      into v_magistrado, v_orgao
    from _perfil_magistrado m
    join magistrado mg on mg.id = m.magistrado_id
    order by random() limit 1;

    -- Perícia social só aparece em BPC/LOAS; as demais, nos benefícios por incapacidade.
    if exists (select 1 from perito where id = v_perito and especialidade = 'Assistência Social') then
      bene_codigo := 'B87';
    else
      bene_codigo := (array['B31','B31','B31','B91','B32','B94','B87'])[1 + floor(random() * 7)::int];
    end if;
    select id into v_beneficio from beneficio where codigo = bene_codigo;

    data_dist    := date '2023-01-10' + (floor(random() * 760))::int;
    data_laudo_v := data_dist + (90 + floor(random() * 200))::int;
    data_dec     := data_laudo_v + (40 + floor(random() * 160))::int;

    insert into processo (numero_cnj, cliente_nome, polo_escritorio, orgao_julgador_id,
                          magistrado_id, beneficio_id, uf, data_distribuicao, data_der,
                          valor_causa, status)
    values (
      lpad((1000000 + i)::text, 7, '0') || '-' || lpad((10 + i % 89)::text, 2, '0')
        || '.' || extract(year from data_dist)::text || '.4.03.6110',
      nomes[1 + floor(random() * array_length(nomes, 1))::int] || ' '
        || sobrenomes[1 + floor(random() * array_length(sobrenomes, 1))::int],
      'ativo', v_orgao, v_magistrado, v_beneficio, 'SP', data_dist,
      data_dist - (30 + floor(random() * 300))::int,
      round((12000 + random() * 60000)::numeric, 2),
      'julgado')
    returning id into v_processo;

    -- Conclusão pericial conforme o perfil do perito.
    reconhece := random() < v_perfil.p_reconhece;

    if not reconhece then
      conclusao_v := case when bene_codigo = 'B87' then 'sem_impedimento'::conclusao_pericial
                          else 'sem_incapacidade'::conclusao_pericial end;
      if random() < 0.07 then conclusao_v := 'inconclusivo'; end if;
    elsif bene_codigo = 'B87' then
      conclusao_v := 'impedimento_longo_prazo';
    elsif bene_codigo = 'B32' then
      conclusao_v := (array['incapacidade_total_permanente','incapacidade_total_permanente',
                            'incapacidade_parcial_permanente'])[1 + floor(random() * 3)::int]::conclusao_pericial;
    elsif bene_codigo = 'B94' then
      conclusao_v := 'incapacidade_parcial_permanente';
    else
      conclusao_v := (array['incapacidade_total_temporaria','incapacidade_total_temporaria',
                            'incapacidade_parcial_temporaria','incapacidade_parcial_permanente'])
                     [1 + floor(random() * 4)::int]::conclusao_pericial;
    end if;

    insert into laudo_pericial (processo_id, perito_id, data_laudo, conclusao, cid_principal,
                                cids, dii, reabilitavel, resumo)
    values (
      v_processo, v_perito, data_laudo_v, conclusao_v,
      (array['M54.5','M75.1','F32.2','F41.1','M51.1','G56.0','I50.0','M17.1','F31.3','M79.7'])
        [1 + floor(random() * 10)::int],
      '{}', data_laudo_v - (60 + floor(random() * 700))::int,
      case when conclusao_v in ('incapacidade_total_permanente','impedimento_longo_prazo')
           then false else random() < 0.6 end,
      case when conclusao_reconhece_incapacidade(conclusao_v)
           then 'Perícia concluiu pela existência de incapacidade laborativa, com limitações descritas nos quesitos.'
           else 'Perícia concluiu pela ausência de incapacidade laborativa atual para a atividade habitual.' end);

    -- Desfecho: probabilidade base do perfil do perito + viés do juízo.
    p_exito := case when reconhece then v_perfil.p_exito_com else v_perfil.p_exito_sem end;
    p_exito := greatest(0.02, least(0.98,
                 p_exito + coalesce((select bias from _perfil_magistrado
                                      where magistrado_id = v_magistrado), 0)));
    foi_favoravel := random() < p_exito;

    if foi_favoravel then
      resultado_v := case when random() < 0.78 then 'procedente'
                          when random() < 0.6  then 'parcialmente_procedente'
                          else 'homologacao_acordo' end::resultado_julgamento;
    else
      resultado_v := case when random() < 0.88 then 'improcedente'
                          else 'extinto_sem_merito' end::resultado_julgamento;
    end if;

    insert into decisao (origem, tipo, titulo, processo_id, numero_cnj, orgao_julgador_id,
                         magistrado_id, instancia, data_decisao, resultado, beneficio_id,
                         dispositivo, ementa, fonte, tags)
    select 'acervo_proprio', 'sentenca',
           'Sentença — ' || b.nome || ' — ' || p.cliente_nome,
           v_processo, p.numero_cnj, v_orgao, v_magistrado, 'primeiro_grau',
           data_dec, resultado_v, v_beneficio,
           case when foi_favoravel
                then 'Julgo procedente o pedido para condenar o INSS a conceder o benefício, com efeitos retroativos à DER.'
                else 'Julgo improcedente o pedido, ante a ausência de comprovação dos requisitos legais.' end,
           case when foi_favoravel
                then 'Comprovadas a qualidade de segurado, a carência e a incapacidade laborativa, impõe-se a concessão do benefício.'
                else 'Ausente a incapacidade laborativa aferida em perícia judicial, improcede o pedido de concessão.' end,
           'Acervo interno (dado sintético de demonstração)',
           array[b.codigo, conclusao_v::text]
    from processo p join beneficio b on b.id = v_beneficio
    where p.id = v_processo
    returning id into v_decisao;

    -- Vincula de 1 a 2 teses à decisão, marcando acolhimento conforme o desfecho.
    insert into decisao_tese (decisao_id, tese_id, acolhida)
    select v_decisao, t.id, foi_favoravel and random() < 0.85
    from tese t
    order by random()
    limit 1 + floor(random() * 2)::int
    on conflict do nothing;

    -- Cerca de 28% dos casos sobem em recurso; parte reforma o 1º grau.
    if random() < 0.28 then
      declare
        v_org_rec  uuid;
        v_rel      uuid;
        reformou   boolean := random() < 0.31;
        res_rec    resultado_julgamento;
      begin
        select o.id, m.id into v_org_rec, v_rel
        from orgao_julgador o
        join magistrado m on m.orgao_julgador_id = o.id
        where o.instancia in ('turma_recursal', 'segundo_grau')
        order by random() limit 1;

        if (foi_favoravel and not reformou) or (not foi_favoravel and reformou) then
          res_rec := 'provido';
        else
          res_rec := 'desprovido';
        end if;

        insert into decisao (origem, tipo, titulo, processo_id, numero_cnj, orgao_julgador_id,
                             magistrado_id, instancia, data_decisao, resultado, favoravel,
                             beneficio_id, ementa, fonte, tags)
        select 'acervo_proprio', 'acordao',
               'Acórdão — ' || b.nome || ' — ' || p.cliente_nome,
               v_processo, p.numero_cnj, v_org_rec, v_rel,
               (select instancia from orgao_julgador where id = v_org_rec),
               data_dec + (120 + floor(random() * 300))::int,
               res_rec,
               -- favoravel é informado direto: o enum não sabe quem recorreu.
               case when reformou then not foi_favoravel else foi_favoravel end,
               v_beneficio,
               'PREVIDENCIÁRIO. BENEFÍCIO POR INCAPACIDADE. CONJUNTO PROBATÓRIO. '
                 || case when reformou then 'Sentença reformada.' else 'Sentença mantida por seus próprios fundamentos.' end,
               'Acervo interno (dado sintético de demonstração)',
               array[b.codigo, 'recurso']
        from processo p join beneficio b on b.id = v_beneficio
        where p.id = v_processo;
      end;
    end if;
  end loop;
end $$;

-- =====================================================================
-- Jurisprudência externa de referência
-- =====================================================================
-- Os enunciados abaixo são PARÁFRASES GENÉRICAS para demonstrar a tela.
-- Os campos `fonte` e `observacoes` deixam isso explícito justamente
-- para que ninguém cite este conteúdo sem conferir o inteiro teor real.
-- =====================================================================
insert into decisao (origem, tipo, titulo, tribunal, instancia, relator, data_decisao,
                     nivel_autoridade, ementa, fonte, observacoes, tags)
values
  ('jurisprudencia_externa', 'sumula', 'Súmula 47 da TNU — incapacidade parcial e condições pessoais',
   'TNU', 'tnu', null, '2010-01-01', 'B',
   'Uma vez reconhecida a incapacidade parcial para o trabalho, deve o julgador considerar as condições pessoais e sociais do segurado para a concessão de aposentadoria por invalidez.',
   'EXEMPLO DE DEMONSTRAÇÃO — confira o texto oficial antes de citar',
   'Registro sintético inserido pelo seed. Substituir pelo verbete oficial.',
   array['TNU','incapacidade parcial','condições pessoais']),

  ('jurisprudencia_externa', 'tese_repetitiva', 'Tema 995/STJ — reafirmação da DER',
   'STJ', 'superior', null, '2019-01-01', 'B',
   'É possível a reafirmação da data de entrada do requerimento para o momento em que implementados os requisitos do benefício, ainda que no curso do processo judicial.',
   'EXEMPLO DE DEMONSTRAÇÃO — confira o texto oficial antes de citar',
   'Registro sintético inserido pelo seed. Substituir pelo acórdão real.',
   array['STJ','repetitivo','DER']),

  ('jurisprudencia_externa', 'tese_repetitiva', 'Tema 350/STF — prévio requerimento administrativo',
   'STF', 'supremo', null, '2014-01-01', 'A',
   'A concessão de benefício previdenciário pressupõe prévio requerimento administrativo, salvo nas hipóteses de notória resistência da autarquia à pretensão.',
   'EXEMPLO DE DEMONSTRAÇÃO — confira o texto oficial antes de citar',
   'Registro sintético inserido pelo seed. Substituir pelo acórdão real.',
   array['STF','repercussão geral','interesse de agir']),

  ('jurisprudencia_externa', 'acordao', 'Perícia por especialidade diversa — nulidade',
   'TRF3', 'segundo_grau', 'Relatoria de demonstração', '2023-05-18', 'D',
   'A realização de perícia por profissional de especialidade incompatível com a patologia alegada compromete a validade da prova técnica e enseja a renovação do ato.',
   'EXEMPLO DE DEMONSTRAÇÃO — confira o texto oficial antes de citar',
   'Registro sintético inserido pelo seed. Substituir pelo acórdão real.',
   array['perícia','nulidade','especialidade']),

  ('jurisprudencia_externa', 'acordao', 'BPC/LOAS — miserabilidade por outros meios de prova',
   'TRF3', 'segundo_grau', 'Relatoria de demonstração', '2024-02-09', 'D',
   'O critério objetivo de um quarto do salário mínimo per capita não impede a aferição da miserabilidade por outros meios de prova, à luz do caso concreto.',
   'EXEMPLO DE DEMONSTRAÇÃO — confira o texto oficial antes de citar',
   'Registro sintético inserido pelo seed. Substituir pelo acórdão real.',
   array['BPC','LOAS','miserabilidade']),

  ('jurisprudencia_externa', 'acordao', 'Alta programada sem nova avaliação pericial',
   'TRF3', 'turma_recursal', 'Relatoria de demonstração', '2024-08-22', 'D',
   'A cessação automática do benefício por alta programada, sem nova avaliação da capacidade laborativa, contraria o dever de motivação do ato administrativo.',
   'EXEMPLO DE DEMONSTRAÇÃO — confira o texto oficial antes de citar',
   'Registro sintético inserido pelo seed. Substituir pelo acórdão real.',
   array['alta programada','restabelecimento']);

-- =====================================================================
-- Acervo de peças
-- =====================================================================
insert into peca (titulo, tipo, beneficio_id, autor, data_peca, modelo, resumo, texto, tags)
select v.titulo, v.tipo::tipo_peca, b.id, v.autor, v.data_peca::date, v.modelo, v.resumo,
       v.resumo || E'\n\n[Texto integral da peça — substituir pelo conteúdo real ao importar o acervo.]',
       v.tags
from (values
  ('Petição inicial — Auxílio por Incapacidade Temporária (modelo base)', 'peticao_inicial', 'B31',
   'Breno Proenço', '2024-03-12', true,
   'Modelo de inicial para restabelecimento de auxílio por incapacidade temporária, com pedido de tutela de urgência e rol de quesitos.',
   array['modelo','B31','tutela de urgência']),
  ('Petição inicial — Aposentadoria por Incapacidade Permanente', 'peticao_inicial', 'B32',
   'Breno Proenço', '2024-05-02', true,
   'Inicial com tese de incapacidade parcial somada a condições pessoais (Súmula 47/TNU).',
   array['modelo','B32','Súmula 47']),
  ('Petição inicial — BPC/LOAS pessoa com deficiência', 'peticao_inicial', 'B87',
   'Breno Proenço', '2024-06-20', true,
   'Inicial de BPC/LOAS com impugnação prévia ao critério objetivo de miserabilidade.',
   array['modelo','B87','miserabilidade']),
  ('Quesitos do autor — perícia ortopédica', 'quesitos', 'B31',
   'Breno Proenço', '2024-04-08', true,
   'Rol de quesitos voltado a lombalgia e lesões por esforço repetitivo, com foco em DII e reabilitação.',
   array['modelo','quesitos','ortopedia']),
  ('Quesitos do autor — perícia psiquiátrica', 'quesitos', 'B31',
   'Breno Proenço', '2024-04-08', true,
   'Quesitos sobre episódios depressivos recorrentes, aderência ao tratamento e prognóstico.',
   array['modelo','quesitos','psiquiatria']),
  ('Impugnação ao laudo — ausência de resposta aos quesitos', 'impugnacao_laudo', 'B31',
   'Breno Proenço', '2024-07-15', true,
   'Impugnação por vício de fundamentação: quesitos do autor não respondidos e ausência de exame físico detalhado.',
   array['modelo','impugnação','cerceamento']),
  ('Impugnação ao laudo — especialidade incompatível', 'impugnacao_laudo', 'B32',
   'Breno Proenço', '2024-09-03', true,
   'Impugnação de perícia realizada por clínico geral em quadro psiquiátrico grave.',
   array['modelo','impugnação','especialidade']),
  ('Recurso inominado — improcedência por laudo desfavorável', 'recurso_inominado', 'B31',
   'Breno Proenço', '2024-10-11', true,
   'Recurso sustentando que o laudo não vincula o julgador e que as condições pessoais autorizam a concessão.',
   array['modelo','recurso','livre convencimento']),
  ('Contrarrazões a recurso do INSS', 'contrarrazoes', 'B31',
   'Breno Proenço', '2024-11-26', true,
   'Contrarrazões defendendo a manutenção da sentença de procedência e a DIB fixada na DER.',
   array['modelo','contrarrazões']),
  ('Apelação — reforma de sentença de improcedência', 'apelacao', 'B32',
   'Breno Proenço', '2025-01-30', true,
   'Apelação com pedido de nova perícia e, subsidiariamente, concessão com base em condições pessoais.',
   array['modelo','apelação']),
  ('Embargos de declaração — omissão quanto à DIB', 'embargos_declaracao', 'B31',
   'Breno Proenço', '2025-02-18', true,
   'Embargos apontando omissão sobre o termo inicial do benefício e os juros de mora.',
   array['modelo','embargos','DIB']),
  ('Memoriais — auxílio-acidente cumulado com aposentadoria', 'memoriais', 'B94',
   'Breno Proenço', '2025-03-25', false,
   'Memoriais sobre cumulação de auxílio-acidente para benefícios anteriores à Lei 9.528/97.',
   array['auxílio-acidente','cumulação'])
) as v(titulo, tipo, beneficio_codigo, autor, data_peca, modelo, resumo, tags)
left join beneficio b on b.codigo = v.beneficio_codigo;

-- Vincula cada peça a uma tese compatível, por palavra-chave.
insert into peca_tese (peca_id, tese_id)
select distinct p.id, t.id
from peca p
join tese t on (
     (p.tags && array['Súmula 47'] and t.nome like 'Incapacidade parcial%')
  or (p.tags && array['miserabilidade'] and t.nome like 'Miserabilidade%')
  or (p.tags && array['especialidade'] and t.nome like 'Impugnação de laudo%')
  or (p.tags && array['cerceamento'] and t.nome like 'Nulidade por cerceamento%')
  or (p.tags && array['DIB'] and t.nome like 'DII fixada%')
  or (p.tags && array['cumulação'] and t.nome like 'Auxílio-acidente%')
)
on conflict do nothing;

commit;

-- Conferência rápida da carga.
select 'processos' as item, count(*) from processo
union all select 'laudos', count(*) from laudo_pericial
union all select 'decisões (acervo)', count(*) from decisao where origem = 'acervo_proprio'
union all select 'jurisprudência externa', count(*) from decisao where origem = 'jurisprudencia_externa'
union all select 'peças', count(*) from peca;
