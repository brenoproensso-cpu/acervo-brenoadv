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
```

Migrations são **append-only**: para mudar o schema, crie um arquivo novo em
`db/migrations/`, nunca edite um já aplicado.

---

## Próximos passos sugeridos

1. **Importação em massa** do acervo existente (PDF/DOCX com extração de texto).
2. **Processos e andamentos**: movimentações, prazos e alertas de vencimento.
3. **Anexos**: a tabela `arquivo` já existe, falta a tela de upload.
4. **Autenticação**, antes de qualquer exposição fora da rede interna.
5. **Integração** com os sistemas de tramitação e pesquisa jurisprudencial já
   usados pelo escritório, para popular o acervo automaticamente.

---

## Aviso

As estatísticas descrevem o que já ocorreu no acervo cadastrado. São uma
fotografia do histórico, não previsão de resultado — e a qualidade delas
depende inteiramente de o cadastro estar completo e correto.

O sistema não tem controle de acesso nesta fase. Como a base guarda nome de
cliente e dados de saúde, mantenha-o restrito à rede interna até que a
autenticação seja implementada.
