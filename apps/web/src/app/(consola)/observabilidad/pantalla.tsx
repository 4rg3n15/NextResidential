'use client';

import type { JSX } from 'react';
import type { FilaDeLatencia } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { EstadoCargando, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi } from '@/lib/api/cliente';
import { useLatencias } from '@/lib/api/consultas';

/**
 * W-11 · Latencias comprometidas (RNF-11.3, ETAPA 14).
 *
 * **El tramo medido se pinta junto a la cifra, no en una ayuda emergente.** Es
 * la decisión que sostiene la pantalla entera: el alcance de la etapa pide
 * poder DEMOSTRAR las latencias, y una cifra sin el tramo que mide no demuestra
 * nada —un p95 de 40 ms sobre el segmento equivocado es una afirmación más
 * cómoda y no más cierta—. Por eso cada fila lleva `noIncluye` a la vista: lo
 * que la cifra no contiene se lee antes que la cifra.
 *
 * **«Sin muestras» no es «cumple».** La API devuelve `cumple: null` cuando no
 * ha medido nada, y aquí se pinta como «sin datos» y no en verde. Un tablero
 * recién arrancado que pintara verde estaría afirmando algo que nadie midió.
 *
 * Los colores salen del sistema de temas (`frontera-tema.mjs`): no hay ni un
 * literal, para que la pantalla se lea igual en claro y en oscuro.
 */
const ms = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `${Math.round(valor)} ms`;

const Veredicto = ({ fila }: { readonly fila: FilaDeLatencia }): JSX.Element => {
  if (fila.cumple === null || fila.cumple === undefined) {
    return <Distintivo tono="neutro">Sin muestras</Distintivo>;
  }
  return fila.cumple ? (
    <Distintivo tono="exito">Dentro del techo</Distintivo>
  ) : (
    <Distintivo tono="peligro">Por encima</Distintivo>
  );
};

export const PantallaDeLatencias = (): JSX.Element => {
  const consulta = useLatencias();

  const columnas: readonly Columna<FilaDeLatencia>[] = [
    {
      clave: 'indicador',
      titulo: 'Indicador',
      celda: (f) => (
        <div>
          <p className="font-medium text-texto">{f.definicion.clave}</p>
          <p className="text-xs text-texto-apagado">{f.definicion.titulo}</p>
        </div>
      ),
    },
    {
      clave: 'techo',
      titulo: 'Techo',
      celda: (f) => <span className="tabular-nums">{ms(f.definicion.umbralMs)}</span>,
    },
    {
      clave: 'p50',
      titulo: 'p50',
      celda: (f) => <span className="tabular-nums">{ms(f.p50)}</span>,
    },
    {
      clave: 'p95',
      titulo: 'p95',
      celda: (f) => <span className="tabular-nums">{ms(f.p95)}</span>,
    },
    {
      clave: 'p99',
      titulo: 'p99',
      celda: (f) => <span className="tabular-nums">{ms(f.p99)}</span>,
    },
    {
      clave: 'muestras',
      titulo: 'Muestras',
      celda: (f) => (
        <span className="tabular-nums">
          {f.muestras} <span className="text-texto-apagado">de {f.observadas}</span>
        </span>
      ),
    },
    {
      clave: 'incumplimientos',
      titulo: 'Por encima',
      celda: (f) => <span className="tabular-nums">{f.incumplimientos}</span>,
    },
    { clave: 'veredicto', titulo: 'Veredicto', celda: (f) => <Veredicto fila={f} /> },
  ];

  if (consulta.isPending) return <EstadoCargando etiqueta="Midiendo las latencias…" />;
  if (consulta.isError) {
    return estadoSegunCodigo(
      consulta.error instanceof ErrorDeApi ? consulta.error.estado : 0,
      'No se pudieron leer las latencias.',
    );
  }

  const datos = consulta.data;

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Latencias comprometidas"
        descripcion="p50, p95 y p99 de los cinco indicadores de latencia del proyecto (KPI-09, 13, 25, 32 y 33)."
      />

      <Tarjeta>
        <CuerpoDeTarjeta>
          <p className="text-sm text-texto-apagado">
            Ventana deslizante de {datos.ventana} muestras por indicador, desde{' '}
            {new Date(datos.desde).toLocaleString('es-CO')}. Las cifras son{' '}
            <strong className="text-texto">de este proceso</strong>: con más de una instancia de API
            cada una lleva la suya y hay que agregarlas fuera.
          </p>
        </CuerpoDeTarjeta>
      </Tarjeta>

      <TablaDeDatos
        titulo="Latencias por indicador"
        columnas={columnas}
        filas={datos.filas}
        claveDeFila={(f: FilaDeLatencia) => f.definicion.clave}
        vacio={{
          titulo: 'Sin mediciones todavía',
          descripcion:
            'El proceso aún no ha atendido ninguna de las rutas marcadas. En cuanto lo haga, aquí salen sus percentiles.',
        }}
      />

      <Tarjeta>
        <CabeceraDeTarjeta
          titulo="Qué mide cada cifra, y qué no"
          descripcion="Una latencia sin su tramo no demuestra nada. Por eso los dos se leen juntos."
        />
        <CuerpoDeTarjeta>
          <dl className="space-y-4">
            {datos.filas.map((f: FilaDeLatencia) => (
              <div key={f.definicion.clave}>
                <dt className="text-sm font-medium text-texto">
                  {f.definicion.clave} · {f.definicion.rnf}
                  {f.definicion.ca === null || f.definicion.ca === undefined
                    ? ''
                    : ` · ${f.definicion.ca}`}
                </dt>
                <dd className="mt-1 text-sm text-texto-apagado">
                  <span className="font-medium text-texto">Mide:</span> {f.definicion.segmento}
                </dd>
                <dd className="mt-1 text-sm text-texto-apagado">
                  <span className="font-medium text-texto">No incluye:</span>{' '}
                  {f.definicion.noIncluye}
                </dd>
              </div>
            ))}
          </dl>
        </CuerpoDeTarjeta>
      </Tarjeta>
    </div>
  );
};
