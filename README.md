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

## Acesso e autenticação

Toda tela exige login. A proteção acontece em duas camadas:

- **Middleware** — quem não traz cookie de sessão vai para `/login` sem custar
  uma consulta ao banco. Roda no Edge, então só verifica a *presença* do cookie.
- **Layout do grupo `(protegido)`** — valida de verdade (token existe, não
  expirou, usuário ativo). Um cookie forjado passa pelo middleware e morre aqui.

No primeiro acesso, com a base sem usuários, a tela de login oferece a criação
do administrador. Depois disso essa opção some e novos usuários passam a ser
criados em **Usuários**, por quem tem papel de administrador.

**Senhas** usam scrypt (N=32768, r=8) com sal por usuário. **Tokens de sessão**
são gravados como hash SHA-256: se o banco vazar, os tokens não servem para
entrar em conta nenhuma. Cinco senhas erradas bloqueiam a conta por 15 minutos,
e todo login, falha e saída ficam registrados em `log_acesso` — necessário
porque a base guarda dado de saúde.

Papéis: `administrador` (gerencia usuários), `advogado` e `colaborador`.

### Trocar e recuperar senha

- **Trocar a própria** — clique no seu nome no cabeçalho → *Minha conta*. A
  senha atual é exigida mesmo com a sessão aberta, e a troca encerra as demais
  sessões.
- **Esqueceu** — não há envio de e-mail. Peça a um administrador que redefina a
  sua em *Usuários*.
- **Conta bloqueada** por cinco erros seguidos: some sozinha em 15 minutos, ou
  um administrador libera na hora em *Usuários*.
- **Único administrador, sem acesso** — resta apagar o usuário no banco e
  refazer o primeiro acesso:

```sql
delete from sessao;
delete from usuario;
```

Feito isso, `/login` volta a oferecer o primeiro acesso. Faça imediatamente:
enquanto não houver usuário, quem chegar primeiro àquela tela vira o
administrador.

---

## Publicando para acesso remoto

Hospedar o banco não basta: o Next.js precisa rodar em algum lugar. São três
peças, e as três são obrigatórias.

### 1. Banco — Supabase (ou qualquer Postgres gerenciado)

Crie o projeto, pegue a *connection string* e aplique as migrations:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
```

Use o **Session pooler** (porta 5432) e não a conexão direta: em serverless,
cada instância abre conexões próprias e a porta direta esgota rápido.

### 2. Aplicação — Vercel

O projeto é Next.js padrão, sem configuração especial. Defina as variáveis:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | conexão com o banco (pooler) |
| `INGESTAO_TOKEN` | protege `POST /api/ingerir` |
| `DATAJUD_API_KEY` | chave pública do CNJ |
| `DJEN_USER_AGENT` | opcional: como o cliente se identifica ao DJEN |
| `NODE_ENV=production` | faz o cookie de sessão exigir HTTPS |

### 3. Depois de cada publicação, confira as migrations

Publicar na Vercel **não aplica migration nenhuma** — são passos separados. Se
o código novo trouxer alteração de estrutura e o banco ficar para trás, as
telas afetadas quebram.

O sistema avisa: aparece uma tarja vermelha no topo de todas as telas dizendo
quais migrations faltam. Quando ela aparecer, cole `db/instalar.sql` de novo no
SQL Editor do Supabase. Reaplicar é seguro — o arquivo só acrescenta o que
falta: as tabelas e os dados ficam intactos, e as views são recriadas do zero
(view não guarda linha nenhuma, é consulta salva).

### 4. Primeiro acesso

Abra a URL publicada e crie o administrador. Faça isso **imediatamente** após o
deploy: enquanto não existir usuário, quem chegar primeiro à tela vira o
administrador.

### Antes de expor

- Senha do banco longa e exclusiva — no Supabase o Postgres fica na internet.
- Não publique a `service_role` em lugar nenhum; a aplicação não a usa.
- Os arquivos anexos (`STORAGE_DIR`) não vão para a Vercel, cujo disco é
  efêmero. Enquanto a tela de upload não existir, isso não bloqueia nada.

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

# Atualiza no DataJud todos os processos já cadastrados.
# O tribunal de cada um sai do próprio número CNJ, então uma execução
# cobre processos de tribunais diferentes.
npm run ingerir -- datajud --pendentes

# Um processo específico
npm run ingerir -- datajud --cnj 1000123-45.2024.4.03.6110

# Documentos de processo (arquivo JSON coletado por qualquer meio)
npm run ingerir -- pdpj --arquivo documentos.json
```

Não existe modo "varrer o tribunal inteiro", de propósito: são milhões de
processos por índice e a API é um bem público compartilhado. O DataJud serve
para acompanhar os processos que você já conhece.

**Use `--dry-run` na primeira execução de cada fonte.** Além de não gravar
nada, ele compara o que a API mandou com o que o normalizador consumiu:

```bash
npm run ingerir -- djen --oab 123456 --uf SP --dry-run
```

```json
"diagnostico": {
  "camposQueAApiMandou":  ["dataDisponibilizacao", "meio", "numeroProcesso", ...],
  "camposQueIgnoramos":   ["meio", "numeroComunicacao"],
  "camposQueSairamVazios": ["dataPublicacao", "numeroOab", "ufOab"]
}
```

- **camposQueIgnoramos** — a API mandou e estamos jogando fora. Se for dado
  útil, acrescente o nome em `CAMPOS_CONHECIDOS` e leia em `normalizar()`.
- **camposQueSairamVazios** — esperávamos preencher e não veio nada. Quase
  sempre é nome de campo diferente do que supusemos: procure o equivalente em
  `camposQueAApiMandou` e acrescente como alternativa.

Isso dispensa ler o swagger: uma execução na máquina certa revela o contrato.

### Quando a rede bloqueia o host

Firewall corporativo costuma barrar `comunicaapi.pje.jus.br` e
`api-publica.datajud.cnj.jus.br`. Nesse caso, obtenha o JSON por outro meio e
importe do arquivo — o resultado é idêntico:

```bash
npm run ingerir -- djen --arquivo comunicacoes.json
npm run ingerir -- pdpj --arquivo documentos.json
```

### Decisões a partir do DJEN

O DJEN publica o **ato**, e o que vem no teor varia por tribunal. Alguns
publicam a sentença inteira na intimação; outros só avisam que ela existe
("fica a parte intimada da sentença de fls."). A ingestão trata os dois casos:
quando o teor traz um dispositivo reconhecível, cria a decisão (sujeita à
conferência); quando é só aviso, grava a publicação e não inventa decisão
nenhuma. O retorno diz qual dos dois aconteceu.

A aplicação precisa estar no ar. Para sincronizar por cron, chame direto o
endpoint `POST /api/ingerir` (proteja com `INGESTAO_TOKEN`).

### Quando o DJEN responde 403

Um 403 aqui quase nunca tem a ver com o que foi consultado — a requisição é
barrada antes de a consulta ser lida. Na tela de **Juízo**, o botão
**"Descobrir o que está barrando"** faz três chamadas de teste a partir do
servidor e diz qual das causas é:

- **Todas as chamadas levam 403, inclusive a mais simples.** O acesso está
  sendo recusado pela origem da chamada. O CNJ restringe consulta vinda de
  servidor fora do Brasil, e a Vercel roda nos Estados Unidos por padrão: em
  **Vercel → Settings → Functions**, mude a região para São Paulo (`gru1`) e
  publique de novo.
- **Alguma chamada responde 200.** Então o acesso existe e o problema era a
  combinação de filtros. O resultado da busca mostra, em `consultaAceita`,
  qual recorte a API entendeu.
- **Nenhuma chamada sai.** O servidor não alcança `comunicaapi.pje.jus.br`.

A busca não depende de acertar o nome do parâmetro de primeira: ela tenta do
recorte mais específico ao mais simples e usa o primeiro que a API aceitar,
aplicando o resto do filtro sobre o que voltou. `DJEN_USER_AGENT` permite
trocar como o cliente se identifica, sem mexer no código.

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
