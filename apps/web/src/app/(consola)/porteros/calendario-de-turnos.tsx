'use client';

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Portero, TurnoDePorteria } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { DialogoDeMotivo } from '@/componentes/dialogo-motivo';
import { EstadoCargando, EstadoError } from '@/componentes/estados';
import { cn } from '@/lib/cn';
import { cliente, desenvolver } from '@/lib/api/cliente';
import { useTurnos } from './consultas';
import { DialogoDeTurno } from './dialogo-turno';

const DIA_MS = 86_400_000;
const HORAS = Array.from({ length: 24 }, (_, h) => h);

/** Lunes de la semana del instante, a las 00:00 locales del navegador. */
const lunesDe = (d: Date): Date => {
  const copia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const desplazamiento = (copia.getDay() + 6) % 7;
  return new Date(copia.getTime() - desplazamiento * DIA_MS);
};
const aDia = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const minutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** ¿La hora `h` del día del turno está cubierta? Un turno que cruza cubre hasta las 24. */
const cubre = (t: TurnoDePorteria, h: number): boolean => {
  const desde = minutos(t.horaInicio);
  const hasta = t.cruzaMedianoche ? 1440 : minutos(t.horaFin);
  return h * 60 + 59 >= desde && h * 60 < hasta;
};

/**
 * CALENDARIO DE TURNOS POR DÍA Y HORA (B4, ADR-024).
 *
 * Una semana, un día por columna y, por turno, la franja pintada sobre las 24
 * horas: se ve de un vistazo quién cubre cada hora y dónde hay un hueco o un
 * cruce. Sin estilos en línea —la CSP los prohíbe—: las 24 casillas son
 * clases fijas.
 */
export const CalendarioDeTurnos = ({
  copropiedadId,
  porteros,
}: {
  readonly copropiedadId: string;
  readonly porteros: readonly Portero[];
}): JSX.Element => {
  const consultas = useQueryClient();
  const [lunes, setLunes] = useState(() => lunesDe(new Date()));
  const hasta = useMemo(() => new Date(lunes.getTime() + 7 * DIA_MS), [lunes]);
  const turnos = useTurnos(copropiedadId, lunes, hasta);
  const [editar, setEditar] = useState<{ turno: TurnoDePorteria | null; dia: string } | null>(null);
  const [retirar, setRetirar] = useState<TurnoDePorteria | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const dias = Array.from({ length: 7 }, (_, i) => new Date(lunes.getTime() + i * DIA_MS));
  const nombre = (id: string): string =>
    porteros.find((p) => p.usuarioId === id)?.nombre ?? 'Portero';

  const confirmarRetiro = async (motivo: string): Promise<void> => {
    if (retirar === null) return;
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/turnos/{turnoId}/retiro', {
          params: { path: { id: copropiedadId, turnoId: retirar.id } },
          body: { motivo },
        }),
      );
      await consultas.invalidateQueries({ queryKey: ['porteria', copropiedadId] });
      setRetirar(null);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo retirar el turno.');
    }
  };

  return (
    <Tarjeta className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-seccion">Calendario de turnos</h2>
        <div className="flex gap-2">
          <Boton
            variante="fantasma"
            tamano="sm"
            onClick={() => setLunes(new Date(lunes.getTime() - 7 * DIA_MS))}
          >
            Semana anterior
          </Boton>
          <Boton variante="fantasma" tamano="sm" onClick={() => setLunes(lunesDe(new Date()))}>
            Esta semana
          </Boton>
          <Boton
            variante="fantasma"
            tamano="sm"
            onClick={() => setLunes(new Date(lunes.getTime() + 7 * DIA_MS))}
          >
            Semana siguiente
          </Boton>
          <Boton
            tamano="sm"
            disabled={porteros.length === 0}
            onClick={() => setEditar({ turno: null, dia: aDia(new Date()) })}
          >
            Asignar turno
          </Boton>
        </div>
      </div>
      {aviso === null ? null : (
        <p
          role="status"
          className="rounded-campo bg-aviso-suave px-3 py-2 text-secundario text-aviso-texto"
        >
          {aviso}
        </p>
      )}
      {turnos.isPending ? (
        <EstadoCargando etiqueta="Cargando turnos" />
      ) : turnos.isError ? (
        <EstadoError
          descripcion={turnos.error.message}
          alReintentar={() => void turnos.refetch()}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-7">
          {dias.map((d) => {
            const dia = aDia(d);
            const delDia = turnos.data.filter((t) => t.dia === dia);
            return (
              <section key={dia} aria-label={`Turnos del ${dia}`} className="space-y-2">
                <h3 className="text-secundario font-medium text-texto">
                  {new Intl.DateTimeFormat('es-CO', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  }).format(d)}
                </h3>
                {delDia.length === 0 ? (
                  <p className="text-secundario text-texto-apagado">Sin turnos</p>
                ) : (
                  delDia.map((t) => (
                    <article key={t.id} className="space-y-1 rounded-campo border border-borde p-2">
                      <p className="text-secundario font-medium text-texto">
                        {nombre(t.porteroId)}
                      </p>
                      <p className="text-secundario text-texto-apagado">
                        {t.horaInicio}–{t.horaFin}
                        {t.cruzaMedianoche ? ' (día siguiente)' : ''}
                        {t.porteria === null ? '' : ` · ${t.porteria}`}
                      </p>
                      <div aria-hidden="true" className="grid grid-cols-12 gap-px">
                        {HORAS.map((h) => (
                          <span
                            key={h}
                            className={cn(
                              'h-1.5 rounded-sm',
                              cubre(t, h) ? 'bg-marca-boton' : 'bg-borde-suave',
                            )}
                          />
                        ))}
                      </div>
                      {t.tipo === 'extra' ? <Distintivo tono="aviso">Extra</Distintivo> : null}
                      <div className="flex gap-1">
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          onClick={() => setEditar({ turno: t, dia })}
                        >
                          Editar
                        </Boton>
                        <Boton variante="fantasma" tamano="sm" onClick={() => setRetirar(t)}>
                          Retirar
                        </Boton>
                      </div>
                    </article>
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
      <DialogoDeTurno
        copropiedadId={copropiedadId}
        abierto={editar !== null}
        turno={editar?.turno ?? null}
        diaInicial={editar?.dia ?? aDia(new Date())}
        porteros={porteros}
        alCerrar={() => setEditar(null)}
        alGuardar={(r) => {
          setEditar(null);
          setAviso(
            r.solapes.length === 0
              ? null
              : `El turno se cruza con ${r.solapes.length} turno(s) de la misma portería. Se permite y queda registrado.`,
          );
        }}
      />
      {retirar === null ? null : (
        <DialogoDeMotivo
          titulo="Retirar turno"
          descripcion="Si el portero tiene la sesión abierta en este turno, se cerrará en su siguiente acción. Queda en la bitácora."
          etiquetaAccion="Retirar"
          variante="peligro"
          error={error}
          alConfirmar={(m) => void confirmarRetiro(m)}
          alCancelar={() => {
            setRetirar(null);
            setError(undefined);
          }}
        />
      )}
    </Tarjeta>
  );
};
