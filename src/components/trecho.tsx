/**
 * Renderiza o trecho destacado devolvido por ts_headline.
 *
 * O Postgres marca os termos encontrados com as sentinelas @@R@@ / @@/R@@
 * em vez de tags HTML. Assim o trecho é quebrado em nós de texto e
 * renderizado como filhos de React, que já escapa o conteúdo — necessário
 * porque um inteiro teor colado de PDF pode trazer markup junto. Usar
 * dangerouslySetInnerHTML com a saída crua do ts_headline injetaria esse
 * markup na página.
 */
export function Trecho({ html, className = "" }: { html: string; className?: string }) {
  const partes = html.split(/@@R@@|@@\/R@@/);

  return (
    <p className={className}>
      {partes.map((parte, i) =>
        // Índices ímpares são o conteúdo que estava entre as sentinelas.
        i % 2 === 1 ? (
          <mark key={i} className="realce">
            {parte}
          </mark>
        ) : (
          <span key={i}>{parte}</span>
        ),
      )}
    </p>
  );
}
