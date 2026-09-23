'use client';

import type { JSX } from 'react';
import type { FichaDelEquipo, HallazgoDelEquipo } from '@ncr/contracts';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ HAY QUE CAMBIAR EN EL EQUIPO, CAMPO POR CAMPO
 *
 * El resultado del sondeo dice si se puede operar. Esta ficha dice **qué
 * arreglar**: qué se leyó, qué debería decir, y si hay un botón que lo haga.
 * Sin ella, «la cámara decide por su cuenta» manda a recorrer la interfaz del
 * aparato buscando cuál de tres cosas es — y son tres vías distintas.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * `no_comprobado` NO SE PINTA COMO `conforme`, Y ÉSE ES EL PUNTO
 *
 * Una consulta que el equipo no contestó deja el campo en blanco. Pintarla en
 * verde sería exactamente el falso verde que este proyecto persigue: el
 * operador creería que está comprobado algo que nadie miró. Va en gris, con la
 * palabra «sin comprobar» escrita.
 *
 * Y el color nunca va solo: cada estado lleva su palabra, porque un tablero que
 * sólo distingue por color no lo distingue para quien no ve el color.
 */

const TONO: Readonly<Record<string, { readonly clase: string; readonly palabra: string }>> = {
  conforme: {
    clase: 'border-exito bg-exito-suave text-exito-texto',
    palabra: 'Correcto',
  },
  aviso: {
    clase: 'border-aviso bg-aviso-suave text-aviso-texto',
    palabra: 'Aviso',
  },
  bloqueo: {
    clase: 'border-peligro bg-peligro-suave text-peligro-texto',
    palabra: 'Impide operar',
  },
  no_comprobado: {
    clase: 'border-borde bg-lienzo text-texto-apagado',
    palabra: 'Sin comprobar',
  },
};

const Hallazgo = ({
  hallazgo,
  alCorregir,
  corrigiendo,
}: {
  readonly hallazgo: HallazgoDelEquipo;
  readonly alCorregir?: (correccion: string) => void;
  readonly corrigiendo?: string | null;
}): JSX.Element => {
  const tono = TONO[hallazgo.estado] ?? TONO['no_comprobado']!;
  return (
    <li className={`rounded-md border px-3 py-2 text-secundario ${tono.clase}`}>
      <p className="font-medium">
        {tono.palabra} · {hallazgo.campo}
      </p>
      <p className="mt-0.5">{hallazgo.detalle}</p>
      {hallazgo.valorLeido === null && hallazgo.valorCorrecto === null ? null : (
        <p className="mt-1">
          <span className="font-medium">Leído:</span> {hallazgo.valorLeido ?? '(nada)'}
          {hallazgo.valorCorrecto === null ? null : (
            <>
              {' · '}
              <span className="font-medium">Debería ser:</span> {hallazgo.valorCorrecto}
            </>
          )}
        </p>
      )}
      {hallazgo.correccion === null || alCorregir === undefined ? null : (
        <button
          type="button"
          disabled={corrigiendo !== null && corrigiendo !== undefined}
          onClick={() => {
            alCorregir(hallazgo.correccion as string);
          }}
          className="mt-2 rounded-campo border border-borde bg-campo px-2 py-1 font-medium text-texto disabled:opacity-60"
        >
          {corrigiendo === hallazgo.correccion ? 'Corrigiendo…' : 'Corregirlo en el equipo'}
        </button>
      )}
    </li>
  );
};

export const FichaDeEquipo = ({
  ficha,
  alCorregir,
  corrigiendo = null,
}: {
  readonly ficha: FichaDelEquipo;
  /** Ausente mientras el equipo no está guardado: no hay a quién corregir. */
  readonly alCorregir?: (correccion: string) => void;
  readonly corrigiendo?: string | null;
}): JSX.Element => (
  <section className="space-y-2">
    <p className="text-secundario text-texto-apagado">
      {ficha.modelo ?? 'Modelo sin declarar'}
      {ficha.firmware === null ? '' : ` · ${ficha.firmware}`}
      {ficha.serie === null ? '' : ` · serie ${ficha.serie}`}
    </p>

    <ul className="space-y-2">
      {ficha.hallazgos.map((hallazgo, indice) => (
        <Hallazgo
          key={`${hallazgo.campo}-${String(indice)}`}
          hallazgo={hallazgo}
          {...(alCorregir === undefined ? {} : { alCorregir })}
          corrigiendo={corrigiendo}
        />
      ))}
    </ul>

    {ficha.sinComprobar.length === 0 ? null : (
      <details className="rounded-md border border-borde bg-lienzo px-3 py-2 text-secundario text-texto-apagado">
        <summary className="cursor-pointer font-medium text-texto">
          {ficha.sinComprobar.length} consulta(s) que el equipo no contestó
        </summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {ficha.sinComprobar.map((linea) => (
            <li key={linea}>{linea}</li>
          ))}
        </ul>
      </details>
    )}
  </section>
);
