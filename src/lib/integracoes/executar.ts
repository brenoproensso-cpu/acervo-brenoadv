/**
 * Execução da ingestão, independente de transporte.
 *
 * Vive aqui, e não na rota HTTP, porque duas portas chamam o mesmo
 * código: a rota `/api/ingerir` (para cron e automação, autenticada por
 * token) e a tela de Sincronização (autenticada pela sessão do usuário).
 * Duplicar isso seria garantir que as duas divergissem.
 */

import { consultar } from "@/lib/db";
import { diagnosticar } from "@/lib/integracoes/tipos";
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

export { registrarSincronizacao };

export type Corpo = {
  fonte: "djen" | "datajud" | "pdpj";
  dryRun?: boolean;
  // DJEN
  numeroOab?: string;
  ufOab?: string;
  dataInicio?: string;
  dataFim?: string;
  comunicacoes?: unknown[];
  // DataJud
  tribunal?: string;
  numeroCnj?: string;
  atualizadoDesde?: string;
  pendentes?: boolean;
  limite?: number;
  // PDPJ
  documentos?: unknown[];
};


export async function executarIngestao(corpo: Corpo) {
  const dryRun = corpo.dryRun === true;
  switch (corpo.fonte) {
    case "djen":
      return ingerirDjen(corpo, dryRun);
    case "datajud":
      return ingerirDataJud(corpo, dryRun);
    case "pdpj":
      return ingerirPdpj(corpo, dryRun);
    default:
      throw new Error("Fonte inválida. Use djen, datajud ou pdpj.");
  }
}

export function escopoDe(c: Corpo): string {
  if (c.fonte === "djen") return `OAB ${c.numeroOab ?? "?"}/${c.ufOab ?? "?"}`;
  if (c.fonte === "datajud") return c.pendentes ? "pendentes" : (c.tribunal ?? c.numeroCnj ?? "?");
  return c.numeroCnj ?? "importacao";
}

// ---------------------------------------------------------------------

async function ingerirDjen(c: Corpo, dryRun: boolean) {
  // Dois caminhos, como no PDPJ: consulta direta à API, ou importação de
  // um payload já obtido por outro meio. O segundo salva quem está atrás
  // de firewall que bloqueia o host do DJEN.
  let itens: unknown[];

  if (c.comunicacoes?.length) {
    itens = c.comunicacoes;
  } else {
    if (!c.numeroOab || !c.ufOab || !c.dataInicio || !c.dataFim) {
      throw new Error(
        "Informe numeroOab, ufOab, dataInicio e dataFim — ou envie `comunicacoes` no corpo.",
      );
    }
    itens = await djen.buscarComunicacoes({
      numeroOab: c.numeroOab,
      ufOab: c.ufOab,
      dataInicio: c.dataInicio,
      dataFim: c.dataFim,
    });
  }

  const amostra = itens.slice(0, 3).map(djen.normalizar);

  if (dryRun) {
    const d = diagnosticar(
      itens,
      itens.slice(0, 10).map((i) => djen.normalizar(i) as unknown as Record<string, unknown>),
      djen.CAMPOS_CONHECIDOS,
    );
    return {
      fonte: "djen",
      dryRun: true,
      recebidos: itens.length,
      // O diagnóstico responde sozinho o que o swagger responderia.
      diagnostico: {
        camposQueAApiMandou: d.camposRecebidos,
        camposQueIgnoramos: d.camposIgnorados,
        camposQueSairamVazios: d.camposVaziosNoResultado,
      },
      amostraNormalizada: amostra.map((a) => ({
        ...a,
        teor: a.teor ? `${a.teor.slice(0, 400)}…` : null,
      })),
      aviso:
        d.camposVaziosNoResultado.length > 0
          ? `Estes saíram vazios em todas as amostras: ${d.camposVaziosNoResultado.join(", ")}. ` +
            `Compare com "camposQueAApiMandou" e ajuste normalizar() em src/lib/integracoes/djen.ts.`
          : "Todos os campos vieram preenchidos.",
    };
  }

  let novos = 0;
  let decisoes = 0;
  for (const item of itens) {
    await gravarBruto(djen.paraBruto(item));
    const g = await gravarPublicacao(djen.normalizar(item));
    if (g.novo) novos++;
    if (g.decisaoCriada) decisoes++;
  }

  await registrarSincronizacao("djen", escopoDe(c), {
    recebidos: itens.length,
    novos,
    cursor: c.dataFim,
  });

  return {
    fonte: "djen",
    recebidos: itens.length,
    novos,
    decisoesExtraidas: decisoes,
    aviso: decisoes
      ? `${decisoes} decisão(ões) reconhecidas no teor publicado, aguardando conferência em /revisao.`
      : "Nenhum teor trouxe dispositivo reconhecível — este tribunal provavelmente publica só o aviso, não a sentença.",
  };
}

/**
 * Percorre os processos já cadastrados e atualiza cada um no DataJud.
 *
 * É assim que o DataJud deve ser usado por um escritório: consultando os
 * processos que se conhece. O tribunal sai do próprio número CNJ, então
 * uma execução cobre processos de tribunais diferentes de uma vez.
 */
async function sincronizarPendentes(c: Corpo, dryRun: boolean) {
  const limite = Math.min(Number(c.limite ?? 50), 200);

  const processos = await consultar<{ id: string; numero_cnj: string }>(
    `select id, numero_cnj from processo
     where numero_cnj is not null
       and (sincronizado_em is null or sincronizado_em < now() - interval '1 day')
     order by sincronizado_em asc nulls first
     limit $1`,
    [limite],
  );

  if (processos.length === 0) {
    return { fonte: "datajud", mensagem: "Nenhum processo pendente de sincronização." };
  }

  if (dryRun) {
    const porTribunal: Record<string, number> = {};
    let semTribunal = 0;
    for (const p of processos) {
      const t = datajud.tribunalDoCnj(p.numero_cnj);
      if (!t) semTribunal++;
      else porTribunal[t] = (porTribunal[t] ?? 0) + 1;
    }
    return {
      fonte: "datajud",
      dryRun: true,
      processosPendentes: processos.length,
      porTribunal,
      semTribunalReconhecido: semTribunal,
    };
  }

  let consultados = 0;
  let encontrados = 0;
  let movimentos = 0;
  const falhas: string[] = [];

  for (const p of processos) {
    const r = await datajud.buscarPorNumero(p.numero_cnj);
    consultados++;

    if (r.erro) {
      falhas.push(`${p.numero_cnj}: ${r.erro}`);
      continue;
    }

    for (const hit of r.itens) {
      await gravarBruto(datajud.paraBruto(hit));
      const n = datajud.normalizar(hit);
      if (!n) continue;
      const g = await gravarProcesso(n);
      if (g.processoId) encontrados++;
      movimentos += g.movimentosNovos;
    }
  }

  await registrarSincronizacao("datajud", "pendentes", {
    recebidos: consultados,
    novos: encontrados,
    erro: falhas.length ? falhas.slice(0, 5).join(" | ") : null,
  });

  return {
    fonte: "datajud",
    consultados,
    encontrados,
    movimentosNovos: movimentos,
    falhas: falhas.slice(0, 10),
  };
}

async function ingerirDataJud(c: Corpo, dryRun: boolean) {
  if (c.pendentes) return sincronizarPendentes(c, dryRun);

  // Com número CNJ, o tribunal é descoberto pelo próprio número.
  const tribunal = c.tribunal ?? (c.numeroCnj ? datajud.tribunalDoCnj(c.numeroCnj) : null);
  if (!tribunal) {
    throw new Error(
      "Informe --cnj (o tribunal sai do número), --tribunal, ou use --pendentes " +
        "para atualizar os processos já cadastrados.",
    );
  }

  const { itens } = await datajud.buscarProcessos({
    tribunal,
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
