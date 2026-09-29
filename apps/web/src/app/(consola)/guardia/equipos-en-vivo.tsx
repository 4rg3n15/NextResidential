'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen } from 'lucide-react';
import type { LineaDeTiempo } from '@ncr/contracts';
import { VideoEnVivo } from '@/componentes/video-en-vivo';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { DialogoDeMotivo } from '@/componentes/dialogo-motivo';
import { resultadoDeOrden } from '@/componentes/resultado-de-orden';
import type { OrdenConResultado } from '@/componentes/resultado-de-orden';
import { cliente, desenvolver, ErrorDeApi } from '@/lib/api/cliente';
import { useNombresDeEquipos } from '@/lib/api/consultas';

/**
 * C10 (15-M) · CUALQUIER EQUIPO EN VIVO, NO SÓLO EL DE LA LLAMADA.
 *
 * Hasta hoy el video de la guardia colgaba del `foco`: sin llamada en cola no
 * había nada que mirar, y con una, sólo ese equipo. Un conjunto tiene varias
 * cámaras, terminales y videoporteros, y el operador necesita ver la que él
 * decida. Este componente es esa elección:
 *
 *  · lista los equipos ACTIVOS con cámara (cámara LPR, terminal facial y
 *    videoportero) desde los nombres de equipos, que no llevan ni dirección ni
 *    credencial;
 *  · al llegar una llamada, `propuesto` PROPONE ese equipo, y el operador
 *    puede cambiarlo sin perder la llamada;
 *  · «Abrir este equipo» exige motivo (RN-08, CA-16/17) y va por la misma
 *    ruta auditada que la portería: `POST …/guardia/ordenes`;
 *  · la línea de tiempo se filtra por el equipo elegido.
 */
const TIPOS_CON_VIDEO = new Set(['camara_lpr', 'terminal_facial', 'intercom']);

const MOTIVOS_DE_APERTURA = [
  'La vivienda confirma la visita por el intercom',
  'Servicio de emergencia identificado',
  'Residente identificado por documento en cámara',
];

const HORAS_DE_LINEA = 24;

export const EquiposEnVivo = ({
  copropiedadId,
  propuesto,
  eventoId,
}: {
  readonly copropiedadId: string;
  /** El equipo de la llamada o del evento en foco; el operador puede cambiarlo. */
  readonly propuesto?: string | undefined;
  /** El evento que motiva la apertura, si lo hay: viaja con la orden. */
  readonly eventoId?: string | undefined;
}): JSX.Element => {
  const consultas = useQueryClient();
  const nombres = useNombresDeEquipos(copropiedadId);
  const [elegido, setElegido] = useState<string | null>(null);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [ultimaOrden, setUltimaOrden] = useState<{
    readonly orden: OrdenConResultado;
    readonly equipo: string;
  } | null>(null);

  const conVideo = (nombres.data ?? []).filter((e) => e.activo && TIPOS_CON_VIDEO.has(e.tipo));

  // La llamada propone; el operador dispone. Cada llamada nueva vuelve a proponer.
  useEffect(() => {
    if (propuesto !== undefined) setElegido(propuesto);
  }, [propuesto]);

  const actual = conVideo.find((e) => e.id === elegido)?.id ?? conVideo[0]?.id ?? null;
  const nombreDe = (id: string | null): string =>
    (nombres.data ?? []).find((e) => e.id === id)?.nombre ?? 'Equipo sin nombre';

  const linea = useQuery<LineaDeTiempo>({
    queryKey: ['linea-de-tiempo', copropiedadId, 'equipo', actual],
    enabled: actual !== null,
    refetchInterval: 15_000,
    queryFn: async () => {
      const hasta = new Date();
      const desde = new Date(hasta.getTime() - HORAS_DE_LINEA * 3_600_000);
      return desenvolver(
        await cliente.GET('/copropiedades/{id}/eventos/linea-de-tiempo', {
          params: {
            path: { id: copropiedadId },
            query: {
              desde: desde.toISOString(),
              hasta: hasta.toISOString(),
              limite: 20,
              dispositivoId: actual ?? '',
            },
          },
        }),
      );
    },
  });

  const abrir = useMutation({
    mutationFn: async (motivo: string) =>
      desenvolver(
        await cliente.POST('/copropiedades/{id}/guardia/ordenes', {
          params: { path: { id: copropiedadId } },
          body: {
            dispositivoId: actual ?? '',
            accion: 'abrir',
            motivo,
            ...(eventoId === undefined ? {} : { eventoId }),
          },
        }),
      ),
    onSuccess: (orden) => {
      setPidiendoMotivo(false);
      setError(undefined);
      setUltimaOrden({ orden, equipo: nombreDe(actual) });
      void consultas.invalidateQueries({ queryKey: ['guardia', copropiedadId] });
      void consultas.invalidateQueries({ queryKey: ['linea-de-tiempo', copropiedadId] });
    },
    onError: (e: unknown) => {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo ejecutar la orden.');
    },
  });

  return (
    <Tarjeta>
      <CabeceraDeTarjeta
        titulo="Equipos en vivo"
        descripcion={
          conVideo.length === 0
            ? 'Sin equipos con cámara activos en esta copropiedad.'
            : `${String(conVideo.length)} con cámara · elige cuál mirar; la llamada propone el suyo.`
        }
        accion={
          <label className="flex items-center gap-2 text-secundario">
            <span className="text-texto-apagado">Equipo</span>
            <select
              aria-label="Equipo en vivo"
              value={actual ?? ''}
              onChange={(e) => setElegido(e.target.value)}
              disabled={conVideo.length === 0}
              className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
            >
              {conVideo.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <CuerpoDeTarjeta>
        {actual === null ? (
          <p className="text-secundario text-texto-apagado">
            Da de alta una cámara, una terminal o un videoportero para verlo aquí.
          </p>
        ) : (
          <div className="space-y-3">
            <VideoEnVivo copropiedadId={copropiedadId} dispositivoId={actual} />
            <div className="flex flex-wrap items-center gap-2">
              <Boton
                variante="exito"
                tamano="sm"
                onClick={() => {
                  setError(undefined);
                  setPidiendoMotivo(true);
                }}
              >
                <DoorOpen className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                Abrir este equipo
              </Boton>
              {ultimaOrden !== null ? (
                <span role="status" className="text-distintivo text-texto-apagado">
                  Última orden en {ultimaOrden.equipo}: {resultadoDeOrden(ultimaOrden.orden).texto}
                </span>
              ) : null}
              {error !== undefined && !pidiendoMotivo ? (
                <span role="alert" className="text-distintivo text-peligro-texto">
                  {error}
                </span>
              ) : null}
            </div>

            <section aria-label={`Últimos eventos de ${nombreDe(actual)}`}>
              <p className="mb-1 text-etiqueta uppercase tracking-wide text-texto-apagado">
                Últimas {String(HORAS_DE_LINEA)} h en {nombreDe(actual)}
              </p>
              {linea.data === undefined || linea.data.elementos.length === 0 ? (
                <p className="text-secundario text-texto-apagado">
                  {linea.isPending ? 'Cargando eventos…' : 'Sin eventos de este equipo.'}
                </p>
              ) : (
                <ul className="space-y-1">
                  {linea.data.elementos.slice(0, 8).map((e) => (
                    <li key={`${e.origen}-${e.id}`} className="flex items-center gap-2">
                      <span className="tabular-nums text-distintivo text-texto-apagado">
                        {new Date(e.ocurridoEn).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <Distintivo tono={e.origen === 'acceso' ? 'marca' : 'neutro'}>
                        {e.titulo}
                      </Distintivo>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </CuerpoDeTarjeta>

      {pidiendoMotivo ? (
        <DialogoDeMotivo
          titulo={`Abrir ${nombreDe(actual)}`}
          descripcion="Sin motivo la puerta no se acciona. Queda con tu nombre, la hora y el equipo."
          etiquetaAccion="Abrir"
          variante="primario"
          sugerencias={MOTIVOS_DE_APERTURA}
          cargando={abrir.isPending}
          error={error}
          alCancelar={() => {
            setPidiendoMotivo(false);
            setError(undefined);
          }}
          alConfirmar={(motivo) => abrir.mutate(motivo)}
        />
      ) : null}
    </Tarjeta>
  );
};
