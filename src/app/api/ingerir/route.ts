/**
 * Endpoint de ingestão.
 *
 * Existe como rota HTTP (e não como script solto) para que o código de
 * integração seja o mesmo usado pela aplicação — com os aliases `@/` já
 * resolvidos — e para que a sincronização periódica seja só um cron
 * chamando esta URL.
 *
 * Protegido por INGESTAO_TOKEN. Sem a variável definida, a rota só
 * aceita chamadas da própria máquina.
 */

import { NextResponse } from "next/server";
import * as djen from "@/lib/integracoes/djen";
import * as datajud from "@/lib/integracoes/datajud";
import * as pdpj from "@/lib/integracoes/pdpj";
import {
  gravarBruto,
  gravarDocumento,
  gravarProcesso,
  gravarPublicacao,
  registrarSincronizacao,
} from "@/lib/integracoes/gravar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Corpo = {
  fonte: "djen" | "datajud" | "pdpj";
  dryRun?: boolean;
  // DJEN
  numeroOab?: string;
  ufOab?: string;
  dataInicio?: string;
  dataFim?: string;
  // DataJud
  tribunal?: string;
  numeroCnj?: string;
  atualizadoDesde?: string;
  // PDPJ
  documentos?: unknown[];
};

function autorizado(req: Request): boolean {
  const token = process.env.INGESTAO_TOKEN;
  if (!token) {
    // Sem token configurado, aceita apenas chamada local.
    const host = req.headers.get("host") ?? "";
    return host.startsWith("localhost") || host.startsWith("127.0.0.1");
  }
  return req.headers.get("authorization") === `Bearer ${token}`;
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json(
      { erro: "Não autorizado. Defina INGESTAO_TOKEN e envie no header Authorization." },
      { status: 401 },
    );
  }

  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ erro: "Corpo JSON inválido." }, { status: 400 });
  }

  const dryRun = corpo.dryRun === true;

  try {
    switch (corpo.fonte) {
      case "djen":
        return NextResponse.json(await ingerirDjen(corpo, dryRun));
      case "datajud":
        return NextResponse.json(await ingerirDataJud(corpo, dryRun));
      case "pdpj":
        return NextResponse.json(await ingerirPdpj(corpo, dryRun));
      default:
        return NextResponse.json(
          { erro: "Fonte inválida. Use djen, datajud ou pdpj." },
          { status: 400 },
        );
    }
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await registrarSincronizacao(corpo.fonte, escopoDe(corpo), {
      recebidos: 0,
      novos: 0,
      erro: mensagem,
    }).catch(() => {});
    return NextResponse.json({ erro: mensagem }, { status: 502 });
  }
}

function escopoDe(c: Corpo): string {
  if (c.fonte === "djen") return `OAB ${c.numeroOab ?? "?"}/${c.ufOab ?? "?"}`;
  if (c.fonte === "datajud") return c.tribunal ?? "?";
  return c.numeroCnj ?? "importacao";
}

// ---------------------------------------------------------------------

async function ingerirDjen(c: Corpo, dryRun: boolean) {
  if (!c.numeroOab || !c.ufOab || !c.dataInicio || !c.dataFim) {
    throw new Error("Informe numeroOab, ufOab, dataInicio e dataFim.");
  }

  const itens = await djen.buscarComunicacoes({
    numeroOab: c.numeroOab,
    ufOab: c.ufOab,
    dataInicio: c.dataInicio,
    dataFim: c.dataFim,
  });

  const amostra = itens.slice(0, 3).map(djen.normalizar);

  if (dryRun) {
    return {
      fonte: "djen",
      dryRun: true,
      recebidos: itens.length,
      amostraNormalizada: amostra,
      aviso:
        "Confira se os campos vieram preenchidos. Se algum estiver nulo, " +
        "ajuste o mapeamento em src/lib/integracoes/djen.ts.",
    };
  }

  let novos = 0;
  for (const item of itens) {
    await gravarBruto(djen.paraBruto(item));
    if (await gravarPublicacao(djen.normalizar(item))) novos++;
  }

  await registrarSincronizacao("djen", escopoDe(c), {
    recebidos: itens.length,
    novos,
    cursor: c.dataFim,
  });

  return { fonte: "djen", recebidos: itens.length, novos };
}

async function ingerirDataJud(c: Corpo, dryRun: boolean) {
  if (!c.tribunal) throw new Error("Informe o tribunal (ex.: trf3, tjsp).");

  const { itens } = await datajud.buscarProcessos({
    tribunal: c.tribunal,
    numeroCnj: c.numeroCnj,
    atualizadoDesde: c.atualizadoDesde,
  });

  if (dryRun) {
    return {
      fonte: "datajud",
      dryRun: true,
      recebidos: itens.length,
      amostraNormalizada: itens.slice(0, 3).map(datajud.normalizar),
      aviso:
        "Se numeroCnj ou movimentos vierem vazios, ajuste o mapeamento em " +
        "src/lib/integracoes/datajud.ts.",
    };
  }

  let processos = 0;
  let movimentos = 0;
  for (const hit of itens) {
    await gravarBruto(datajud.paraBruto(hit));
    const n = datajud.normalizar(hit);
    if (!n) continue;
    const r = await gravarProcesso(n);
    if (r.processoId) processos++;
    movimentos += r.movimentosNovos;
  }

  await registrarSincronizacao("datajud", escopoDe(c), {
    recebidos: itens.length,
    novos: processos,
  });

  return { fonte: "datajud", recebidos: itens.length, processos, movimentosNovos: movimentos };
}

async function ingerirPdpj(c: Corpo, dryRun: boolean) {
  // Dois caminhos: documentos enviados no corpo, ou busca direta no
  // DataLake quando há credencial configurada.
  const brutos = c.documentos?.length
    ? c.documentos
    : c.numeroCnj
      ? await pdpj.baixarDocumentos(c.numeroCnj)
      : [];

  if (brutos.length === 0) {
    throw new Error(
      "Nada a importar. Envie `documentos` no corpo ou informe `numeroCnj` " +
        "com PDPJ_API_URL/PDPJ_API_TOKEN configurados.",
    );
  }

  if (dryRun) {
    const normalizados = brutos.map(pdpj.normalizar);
    const porCategoria: Record<string, number> = {};
    for (const d of normalizados) {
      const k = d.categoria ?? "sem categoria";
      porCategoria[k] = (porCategoria[k] ?? 0) + 1;
    }
    return {
      fonte: "pdpj",
      dryRun: true,
      recebidos: brutos.length,
      porCategoria,
      amostraNormalizada: normalizados.slice(0, 3).map((d) => ({
        ...d,
        texto: d.texto ? `${d.texto.slice(0, 300)}…` : null,
        metadados: undefined,
      })),
    };
  }

  let novos = 0;
  let laudos = 0;
  let decisoes = 0;
  for (const doc of brutos) {
    await gravarBruto(pdpj.paraBruto(doc));
    const r = await gravarDocumento(pdpj.normalizar(doc));
    if (r.novo) novos++;
    if (r.laudoCriado) laudos++;
    if (r.decisaoCriada) decisoes++;
  }

  await registrarSincronizacao("pdpj", escopoDe(c), {
    recebidos: brutos.length,
    novos,
  });

  return {
    fonte: "pdpj",
    recebidos: brutos.length,
    novos,
    laudosExtraidos: laudos,
    decisoesExtraidas: decisoes,
    aviso:
      laudos + decisoes > 0
        ? `${laudos} laudo(s) e ${decisoes} decisão(ões) aguardam conferência em /revisao antes de entrar nas estatísticas.`
        : undefined,
  };
}
