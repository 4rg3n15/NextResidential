'use client';

import type { JSX } from 'react';
import type { Zona } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi } from '@/lib/api/cliente';
import { useZonas } from '@/lib/api/consultas';
import { franjaEnTexto } from './horario';

/**
 * Zonas comunes.
 *
 * **La interfaz REFLEJA; no calcula.** El aforo lo garantiza la base —una
 * restricción, no un `if`— y el «dentro de horario» lo resuelve el objeto de
 * valor con el reloj inyectado. Si esta pantalla restara ingresos de salidas
 * para pintar la barra, tendría una segunda verdad que se separaría de la
 * primera en la primera carrera: dos personas entrando a la vez.
 *
 * Por eso se refresca cada quince segundos en vez de recalcular: preguntar es
 * más lento que sumar, y es lo único que no puede mentir.
 */
export const PantallaDeZonas = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consulta = useZonas(copropiedadId);

  if (consulta.isError) {
    const e = consulta.error;
    return estadoSegunCodigo(
      e instanceof ErrorDeApi ? e.estado : 0,
      e instanceof Error ? e.message : 'Error inesperado',
      () => void consulta.refetch(),
    );
  }

  const zonas = consulta.data ?? [];

  return (
    <>
      <EncabezadoDePantalla
        titulo="Zonas comunes"
        descripcion="Ocupación en tiempo real frente al aforo máximo. El aforo lo garantiza la base de datos; esta pantalla lo muestra."
        resumen={
          consulta.data === undefined ? null : (
            <Distintivo tono="neutro">{zonas.length} zonas configuradas</Distintivo>
          )
        }
      />

      {consulta.isLoading ? <EstadoCargando etiqueta="Cargando zonas" /> : null}

      {consulta.data !== undefined && zonas.length === 0 ? (
        <EstadoVacio
          titulo="Sin zonas comunes"
          descripcion="Esta copropiedad no tiene zonas configuradas todavía."
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {zonas.map((z) => (
          <TarjetaDeZona key={z.id} zona={z} />
        ))}
      </div>
    </>
  );
};

const TarjetaDeZona = ({ zona }: { readonly zona: Zona }): JSX.Element => {
  const porcentaje =
    zona.aforoMaximo === 0
      ? 0
      : Math.min(100, Math.round((zona.aforoActual / zona.aforoMaximo) * 100));
  const tono = zona.aforoCompleto ? 'peligro' : porcentaje >= 80 ? 'aviso' : 'exito';

  return (
    <Tarjeta>
      <CabeceraDeTarjeta
        titulo={zona.nombre}
        descripcion={zona.tipo}
        accion={
          <Distintivo tono={zona.dentroDeHorario && zona.abierta ? 'exito' : 'neutro'}>
            {zona.abierta === false
              ? 'Cerrada'
              : zona.dentroDeHorario
                ? 'Abierta'
                : 'Fuera de horario'}
          </Distintivo>
        }
      />
      <CuerpoDeTarjeta className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-cuerpo font-medium tabular-nums">
              {zona.aforoActual} / {zona.aforoMaximo}
            </span>
            <span className="text-secundario text-texto-apagado">
              {zona.aforoDisponible} disponible{zona.aforoDisponible === 1 ? '' : 's'}
            </span>
          </div>
          {/* La barra es una imagen del número que ya vino; no lo recalcula. */}
          <div
            className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutro-suave"
            role="img"
            aria-label={`Ocupación ${porcentaje}% de ${zona.aforoMaximo} plazas`}
          >
            <div
              className={
                tono === 'peligro'
                  ? 'h-full bg-peligro'
                  : tono === 'aviso'
                    ? 'h-full bg-aviso'
                    : 'h-full bg-exito'
              }
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>

        <div>
          <p className="text-secundario font-medium text-texto">Horario</p>
          {zona.horario.length === 0 ? (
            <p className="text-secundario text-texto-apagado">
              Sin franjas: abierta según política.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {zona.horario.map((f, i) => (
                <li
                  key={`${f.dia}-${f.minutoInicio}-${i}`}
                  className="text-secundario text-texto-apagado"
                >
                  {franjaEnTexto(f)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {zona.normas.length > 0 ? (
          <div>
            <p className="text-secundario font-medium text-texto">Normas y restricciones</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {zona.normas.map((n) => (
                <li key={n} className="text-secundario text-texto-apagado">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="text-secundario font-medium text-texto">Reservas de hoy</p>
          {zona.reservasDelDia.length === 0 ? (
            // Estado vacío HONESTO: no hay módulo de reservas todavía (P-15), y
            // se dice. Un «0 reservas» a secas se leería como «hoy nadie
            // reservó», que es una afirmación que este sistema no puede hacer.
            <p className="text-secundario text-texto-apagado">
              El módulo de reservas no está construido todavía: esta lista no refleja reservas
              reales.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {zona.reservasDelDia.map((r) => (
                <li key={r.id} className="text-secundario text-texto-apagado">
                  {r.titular} · {r.personas} personas
                </li>
              ))}
            </ul>
          )}
        </div>
      </CuerpoDeTarjeta>
    </Tarjeta>
  );
};
