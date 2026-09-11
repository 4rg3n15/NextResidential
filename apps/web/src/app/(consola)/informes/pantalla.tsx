'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { FilaDeInforme, TipoDeInforme } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { GraficoDeFrecuencia } from '@/componentes/grafico-frecuencia';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi } from '@/lib/api/cliente';
import { useInforme } from '@/lib/api/consultas';

const TIPOS: readonly { readonly valor: TipoDeInforme; readonly etiqueta: string }[] = [
  { valor: 'accesos_por_periodo', etiqueta: 'Accesos por periodo' },
  { valor: 'visitantes_frecuentes', etiqueta: 'Visitantes frecuentes' },
  { valor: 'uso_de_zonas', etiqueta: 'Uso de zonas' },
  { valor: 'auditoria_de_sistema', etiqueta: 'Auditoría de sistema' },
];

const haceDias = (dias: number): string =>
  new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

/**
 * Informes y auditoría.
 *
 * **El informe se GENERA cuando se pide, no al abrir la pantalla.** Es una
 * consulta cara sobre el histórico y encadenarla a cada cambio de un
 * desplegable la dispararía cuatro veces mientras alguien ajusta el rango. El
 * botón «Generar informe» del mockup es exactamente eso, y aquí significa lo
 * que parece.
 *
 * **Las limitaciones del informe se muestran, no se esconden.** La API devuelve
 * `notas` con lo que ese informe concreto NO puede afirmar —hoy, que el evento
 * no distingue residente de visitante— y se pintan junto al resultado. Un
 * informe que calla lo que no sabe se acaba citando como si lo supiera.
 */
export const PantallaDeInformes = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const [tipo, setTipo] = useState<TipoDeInforme>('accesos_por_periodo');
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(haceDias(0));
  const [pedido, setPedido] = useState(false);

  const rango = {
    desde: new Date(`${desde}T00:00:00`).toISOString(),
    hasta: new Date(new Date(`${hasta}T00:00:00`).getTime() + 86_400_000).toISOString(),
  };

  const consulta = useInforme(copropiedadId, { tipo, ...rango }, pedido);

  const columnas: readonly Columna<FilaDeInforme>[] = [
    {
      clave: 'momento',
      titulo: 'Fecha / hora',
      texto: (f) => f.momento,
      celda: (f) => (
        <span className="tabular-nums text-secundario">
          {new Date(f.momento).toLocaleString('es-CO', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      ),
    },
    {
      clave: 'titular',
      titulo: 'Propietario / visitante',
      texto: (f) => f.titular,
      celda: (f) => f.titular,
    },
    { clave: 'vivienda', titulo: 'Casa', texto: (f) => f.vivienda, celda: (f) => f.vivienda },
    {
      clave: 'dispositivo',
      titulo: 'Dispositivo',
      texto: (f) => f.dispositivo,
      celda: (f) => f.dispositivo,
    },
    {
      clave: 'metodo',
      titulo: 'Método',
      texto: (f) => f.metodo,
      celda: (f) => <Distintivo tono="neutro">{f.metodo}</Distintivo>,
    },
    {
      clave: 'resultado',
      titulo: 'Resultado',
      texto: (f) => `${f.resultado} ${f.detalle}`,
      celda: (f) => (
        <div>
          <Distintivo tono={f.resultado === 'permitido' ? 'exito' : 'peligro'}>
            {f.resultado === 'permitido' ? 'Permitido' : 'Negado'}
          </Distintivo>
          <p className="mt-0.5 text-secundario text-texto-apagado">{f.detalle}</p>
        </div>
      ),
    },
  ];

  const informe = consulta.data;

  return (
    <>
      <EncabezadoDePantalla
        titulo="Informes y auditoría"
        descripcion="Los cuatro informes salen del MISMO hecho —el evento— para que no puedan contradecirse entre sí."
      />

      <Tarjeta className="mb-4">
        <CabeceraDeTarjeta titulo="Parámetros" descripcion="Elige el informe y el periodo." />
        <CuerpoDeTarjeta className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-secundario">
            <span className="text-texto-apagado">Tipo de informe</span>
            <select
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoDeInforme);
                setPedido(false);
              }}
              className="rounded-campo border border-borde bg-white px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-secundario">
            <span className="text-texto-apagado">Desde</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setPedido(false);
              }}
              className="rounded-campo border border-borde bg-white px-3 py-2 text-cuerpo"
            />
          </label>
          <label className="flex flex-col gap-1 text-secundario">
            <span className="text-texto-apagado">Hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value);
                setPedido(false);
              }}
              className="rounded-campo border border-borde bg-white px-3 py-2 text-cuerpo"
            />
          </label>
          <Boton onClick={() => setPedido(true)} cargando={consulta.isFetching && pedido}>
            Generar informe
          </Boton>
        </CuerpoDeTarjeta>
      </Tarjeta>

      {!pedido ? (
        <EstadoVacio
          titulo="Ningún informe generado todavía"
          descripcion="Elige el tipo y el periodo, y pulsa «Generar informe». Es una consulta sobre el histórico y se ejecuta cuando la pides."
        />
      ) : null}

      {pedido && consulta.isError
        ? estadoSegunCodigo(
            consulta.error instanceof ErrorDeApi ? consulta.error.estado : 0,
            consulta.error instanceof Error ? consulta.error.message : 'Error inesperado',
            () => void consulta.refetch(),
          )
        : null}

      {pedido && consulta.isLoading ? <EstadoCargando etiqueta="Generando informe" /> : null}

      {informe !== undefined ? (
        <>
          {informe.notas.length > 0 ? (
            <div
              role="note"
              className="mb-4 rounded-tarjeta border border-aviso bg-aviso-suave px-4 py-3"
            >
              <p className="text-secundario font-semibold text-aviso-texto">
                Lo que este informe no puede afirmar
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {informe.notas.map((n) => (
                  <li key={n} className="text-secundario text-aviso-texto">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {informe.truncado ? (
            <p
              role="status"
              className="mb-4 rounded-md border border-borde bg-lienzo px-3 py-2 text-secundario text-texto-apagado"
            >
              La vista previa está recortada. La exportación desde «Eventos» trae el conjunto
              completo.
            </p>
          ) : null}

          <Tarjeta className="mb-4">
            <CabeceraDeTarjeta
              titulo="Frecuencia de accesos por semana"
              descripcion={`${informe.total} registro${informe.total === 1 ? '' : 's'} en el periodo`}
            />
            <CuerpoDeTarjeta>
              <GraficoDeFrecuencia
                puntos={informe.frecuencia}
                etiqueta="Accesos por semana en el periodo seleccionado"
              />
            </CuerpoDeTarjeta>
          </Tarjeta>

          <TablaDeDatos
            titulo="Vista previa"
            columnas={columnas}
            filas={informe.filas}
            claveDeFila={(f) => `${f.momento}-${f.dispositivo}-${f.titular}`}
            porPagina={15}
            buscador={{ marcador: 'Buscar en la vista previa' }}
            vacio={{
              titulo: 'Sin datos en el rango',
              descripcion:
                'Este informe no encontró registros para el periodo elegido. Amplía el rango o cambia el tipo.',
            }}
          />
        </>
      ) : null}
    </>
  );
};
