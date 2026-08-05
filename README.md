# Acervo Jurídico — Breno Proenço Advogado

Sistema interno para guardar decisões, jurisprudência e peças, e para medir
padrões judiciais em cima desse acervo — por exemplo, quantas sentenças
favoráveis saíram nos casos em que determinado perito reconheceu incapacidade.

Esta é a primeira entrega. Cobre **acervo, busca e estatísticas**. O módulo de
processos e andamentos está esboçado no banco (a tabela `processo` existe,
porque a estatística depende dela) mas ainda não tem telas.

---

## Subindo o sistema

Requisitos: Node 20+ e um Postgres 14 ou superior.

```bash
cp .env.example .env      # ajuste a DATABASE_URL
npm install
docker compose up -d      # sobe um Postgres local na porta 5432
npm run db:setup          # aplica as migrations e carrega dados de exemplo
npm run dev               # http://localhost:3000
```

Para começar com a base **vazia**, use `npm run db:migrate` no lugar de
`db:setup` — o `db:setup` inclui a carga de demonstração.

### Comandos de banco

| Comando | O que faz |
|---|---|
| `npm run db:migrate` | Aplica as migrations pendentes. Cada uma roda uma vez só. |
| `npm run db:seed` | Carrega a base de demonstração (apaga o conteúdo atual). |
| `npm run db:reset` | Derruba o schema e reaplica tudo do zero. |
| `npm run db:setup` | `db:migrate` + `db:seed`. |

### Sobre o banco

O sistema fala Postgres puro, via `DATABASE_URL`. Roda igual em Postgres local
(Docker), em Supabase ou em qualquer provedor gerenciado — não há dependência
de recurso exclusivo de nenhum deles.

Para usar no Supabase, copie a *connection string* do painel (Session pooler,
porta 5432) e cole na `DATABASE_URL`. Note que o plano gratuito do Supabase
limita cada organização a **dois projetos ativos**; se os seus dois slots já
estiverem ocupados, ou você libera um, ou cria outra organização, ou fica no
Postgres local.

> **Dados de demonstração são sintéticos.** Peritos, magistrados, clientes,
> números de processo e as ementas de jurisprudência do `db/seed.sql` são
> inventados. As entradas de jurisprudência trazem, no campo de fonte, o aviso
> `EXEMPLO DE DEMONSTRAÇÃO`. Nada ali serve para citar em peça — troque pelo
> inteiro teor real antes de usar.

---

## O que o sistema faz

### Acervo de decisões

Guarda dois tipos de material, separados pelo campo **origem**:

- **Acervo próprio** — sentenças e acórdãos dos processos do escritório. É o
  que alimenta as estatísticas.
- **Jurisprudência externa** — súmulas, temas repetitivos e acórdãos de
  referência. Material de consulta, fora das estatísticas.

Cada decisão pode ser vinculada a um processo, a um órgão julgador, a um
magistrado, a um benefício e a uma ou mais teses.

### Acervo de peças

Petições, recursos, quesitos, impugnações e memoriais, com marcação de
"modelo reutilizável" e vínculo com as teses que sustentam.

### Busca

Busca full-text em português sobre ementa, dispositivo, inteiro teor e texto
das peças. A configuração `portugues_sem_acento` aplica o `unaccent` na
tokenização, então **buscar "pericia" encontra "perícia"** — e o trecho
destacado no resultado sai com os acentos preservados.

Sintaxe aceita na caixa de busca:

| Você digita | Resultado |
|---|---|
| `alta programada` | documentos com as duas palavras |
| `"alta programada"` | a expressão exata |
| `incapacidade -acordo` | com "incapacidade", sem "acordo" |
| `sumula or tema` | qualquer um dos dois |

### Padrões judiciais

A tela **Padrões** cruza o acervo próprio por:

- **Conclusão pericial × desfecho** — o número que responde à pergunta
  central. Mostra a taxa de êxito quando o laudo reconheceu incapacidade
  contra quando não reconheceu, e a diferença entre as duas.
- **Perito** — volume, com que frequência reconhece incapacidade, e a taxa de
  êxito em cada um dos dois cenários. É onde se vê que um perito restritivo
  pode ter êxito altíssimo *quando* reconhece.
- **Órgão julgador, magistrado, benefício e tese.**

Cada processo entra **uma única vez**, pela sua última decisão: se houve
sentença e depois acórdão que a reformou, vale o acórdão.

O símbolo ⚠ marca recortes com menos de oito casos, em que a taxa oscila
demais para orientar decisão.

---

## Entrada de dados: DJEN, DataJud e PDPJ

As três fontes entregam coisas diferentes, e essa diferença define o desenho
da ingestão.

| Fonte | Entrega | Não entrega |
|---|---|---|
| **DJEN** | Teor das intimações e comunicações publicadas. Consulta por OAB. | Inteiro teor de sentença, petições, laudo. |
| **DataJud** (API Pública CNJ) | Metadados do processo e movimentos codificados pela TPU, de 91 tribunais com uma chave só. | Texto de documento — nenhum. |
| **PDPJ** (DataLake) | O texto dos documentos: inicial, contestação, sentença, acórdão e **laudo pericial**. | — |

A consequência prática: **só o PDPJ alimenta a análise de padrões**. Perito e
conclusão pericial não são campo estruturado em lugar nenhum — saem do texto do
laudo. DJEN e DataJud mantêm o acervo vivo (publicações, prazos, andamentos),
mas não geram um único ponto no cruzamento "conclusão × desfecho".

### Como rodar

```bash
# Publicações dos últimos 7 dias
npm run ingerir -- djen --oab 123456 --uf SP --dias 7

# Processos e movimentos de um tribunal
npm run ingerir -- datajud --tribunal trf3 --desde 2026-01-01

# Documentos de processo (arquivo JSON coletado por qualquer meio)
npm run ingerir -- pdpj --arquivo documentos.json
```

**Use `--dry-run` na primeira execução de cada fonte.** Ele mostra como os
campos foram interpretados sem gravar nada:

```bash
npm run ingerir -- djen --oab 123456 --uf SP --dry-run
```

A aplicação precisa estar no ar. Para sincronizar por cron, chame direto o
endpoint `POST /api/ingerir` (proteja com `INGESTAO_TOKEN`).

### Sobre os contratos das APIs

Os adaptadores em `src/lib/integracoes/` foram escritos contra a documentação
das APIs, mas **não foram exercitados contra os endpoints em produção** — o
ambiente onde este código nasceu não tem saída de rede. É provável que algum
nome de campo divirja na primeira execução real.

O desenho absorve isso:

1. **O payload cru é gravado inteiro** em `payload_bruto`, antes de qualquer
   normalização. Nada se perde.
2. **A leitura tolera variações** — `campo(item, "numeroProcesso",
   "numero_processo", "numeroCnj")` tenta os nomes em ordem.
3. **O conserto fica num lugar só**: a função `normalizar()` do adaptador da
   fonte. Corrigido o mapeamento, reprocesse a partir do bruto.

### A barreira de conferência

Conclusão pericial e resultado de sentença são **inferidos de texto corrido**,
muitas vezes vindo de OCR. Errar a classificação de um laudo não gera só uma
linha errada: distorce a taxa de êxito do perito, que é exatamente o número
usado para decidir se vale impugnar.

Por isso tudo que a extração produz entra marcado como
`extraido_automatico` e **fica fora das estatísticas** até ser confirmado na
tela **Conferência** (`/revisao`). O painel avisa quando a fila cresce.

A extração acompanha um conjunto de casos de teste, incluindo armadilhas
(laudo cuja fundamentação cita incapacidade mas cuja conclusão nega):

```bash
npm run testar:extracao
```

Dois pontos que a máquina não resolve sozinha e a conferência pergunta:

- **Se o laudo é ambíguo**, a confiança sai baixa e o item vai para o topo da
  fila.
- **Se a decisão é de recurso**, "nego provimento" pode ser favorável ou não,
  conforme quem recorreu — a tela pergunta explicitamente.

---

## Decisões de modelagem que valem explicar

**`favoravel` é uma coluna, não um cálculo.** O desfecho "desprovido" é
desfavorável se o recurso era seu e favorável se era do INSS — e o enum de
resultado não sabe quem recorreu. Então há um palpite automático a partir do
resultado e do polo do escritório, e um campo no formulário para sobrescrever.
Sempre que o recurso for da autarquia, informe manualmente.

**Laudo é tabela separada de processo.** Um caso pode ter perícia judicial,
assistente técnico e complementar. Separar permite medir cada perito
isoladamente, e é por isso que a tabela `processo` existe já nesta fase: ela é
a âncora que liga o laudo à decisão do mesmo caso.

**`reconheceu_incapacidade` é coluna gerada.** Derivada da conclusão pericial
pela função `conclusao_reconhece_incapacidade`, para que a regra viva num lugar
só e possa ser indexada. Cobre tanto incapacidade (auxílio-doença,
aposentadoria por incapacidade, auxílio-acidente) quanto impedimento de longo
prazo (BPC/LOAS).

**O tsvector é montado por trigger, não por coluna gerada.** Coluna gerada
exige função `IMMUTABLE`, e o `unaccent` não é. O trigger não tem essa
restrição.

---

## Estrutura

```
db/
  migrations/       Migrations numeradas, aplicadas em ordem e uma única vez
  seed.sql          Carga de demonstração (sintética)
scripts/db.mjs      Runner de migrations e seed
src/
  app/              Rotas (App Router)
    page.tsx          Painel
    decisoes/         Lista, detalhe e cadastro de decisões
    pecas/            Lista, detalhe e cadastro de peças
    padroes/          Cruzamentos estatísticos
    peritos/          Lista e ficha individual do perito
  components/       Componentes de interface
  lib/
    db.ts             Pool de conexão e montagem de filtros
    queries.ts        Todas as consultas
    labels.ts         Tradução dos enums para a tela
    integracoes/
      tipos.ts        Contratos internos e leitura tolerante de campos
      djen.ts         Cliente e normalizador do DJEN
      datajud.ts      Cliente e normalizador do DataJud
      pdpj.ts         Documentos do PDPJ e categorização
      extracao.ts     Conclusão pericial e resultado, a partir do texto
      gravar.ts       Persistência idempotente
```

Migrations são **append-only**: para mudar o schema, crie um arquivo novo em
`db/migrations/`, nunca edite um já aplicado.

---

## Próximos passos sugeridos

1. **Conferir os adaptadores** contra as APIs reais, com `--dry-run`, e ajustar
   os mapeamentos que divergirem.
2. **Autenticação**, antes de qualquer exposição fora da rede interna.
3. **Sincronização periódica** por cron chamando `/api/ingerir`.
4. **Prazos**: a estimativa a partir do tipo de comunicação é rudimentar;
   contagem real depende de suspensão de expediente e feriado local.
5. **Extração por LLM** como segunda opinião nos laudos de baixa confiança,
   mantendo a conferência humana como palavra final.
6. **Anexos**: a tabela `arquivo` já existe, falta a tela de upload.

---

## Aviso

As estatísticas descrevem o que já ocorreu no acervo cadastrado. São uma
fotografia do histórico, não previsão de resultado — e a qualidade delas
depende inteiramente de o cadastro estar completo e correto.

O sistema não tem controle de acesso nesta fase. Como a base guarda nome de
cliente e dados de saúde, mantenha-o restrito à rede interna até que a
autenticação seja implementada.
