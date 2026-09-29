'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Equipo } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

/**
 * C4 (15-M) · ELIMINAR UN EQUIPO ES DARLO DE BAJA CON MOTIVO (RN-19).
 *
 * La ruta `POST …/equipos/:equipoId/baja` existía sin interfaz. Lo que hace la
 * API al recibirla, y que la consola sólo refleja: cierra su escucha
 * (`OLVIDO_DE_EQUIPO`), libera su dirección y puerto (el índice único
 * `dispositivos_endpoint_uk` es parcial por `estado = 'activo'`), y deja
 * constancia en `auditoria_seguridad`. Nada se borra: la lista de abajo enseña
 * los dados de baja y permite reactivarlos.
 */
export const LONGITUD_MINIMA_DEL_MOTIVO_DE_BAJA = 5;

const invalidarEquipos = async (
  consultas: ReturnType<typeof useQueryClient>,
  copropiedadId: string,
): Promise<void> => {
  await consultas.invalidateQueries({ queryKey: ['dispositivos', copropiedadId] });
  await consultas.invalidateQueries({ queryKey: ['tablero', copropiedadId, 'dispositivos'] });
};

/**
 * C4 (15-M) · lo que pasó con los rostros que el equipo tenía (RN-11): los
 * retirados, y los que siguen en él porque no contestó —que se dicen—.
 */
export const textoDeRostros = (retiradas: number, pendientes: number): string =>
  (retiradas > 0 ? ` Se retiraron ${String(retiradas)} rostro(s) del equipo.` : '') +
  (pendientes > 0
    ? ` ${String(pendientes)} rostro(s) siguen en el equipo porque no contestó: bórrelos en el ` +
      'propio equipo o reactívelo para retirarlos desde aquí.'
    : '');

export const DialogoDeBajaDeEquipo = ({
  copropiedadId,
  equipo,
  alCerrar,
  alDarDeBaja,
}: {
  readonly copropiedadId: string;
  readonly equipo: Pick<Equipo, 'id' | 'nombre'> | null;
  readonly alCerrar: () => void;
  readonly alDarDeBaja?: (aviso: string) => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (equipo === null) return;
    setMotivo('');
    setConfirmado(false);
    setError(undefined);
  }, [equipo]);

  const limpio = motivo.normalize('NFC').replace(/\s+/g, ' ').trim();
  const motivoVale = limpio.length >= LONGITUD_MINIMA_DEL_MOTIVO_DE_BAJA && limpio.length <= 300;

  const enviar = async (): Promise<void> => {
    if (equipo === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      const hecho = desenvolver(
        await cliente.POST('/copropiedades/{id}/equipos/{equipoId}/baja', {
          params: { path: { id: copropiedadId, equipoId: equipo.id } },
          body: { motivo: limpio },
        }),
      );
      await invalidarEquipos(consultas, copropiedadId);
      alDarDeBaja?.(
        `${equipo.nombre} quedó dado de baja. Su dirección y su puerto quedan libres.` +
          textoDeRostros(hecho.plantillasRetiradas, hecho.plantillasPendientes),
      );
      alCerrar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo dar de baja el equipo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={equipo !== null}
      titulo={`Dar de baja ${equipo?.nombre ?? ''}`}
      descripcion="No se borra nada: el equipo deja de escucharse y de operar, libera su dirección y su puerto, y queda con tu nombre, la hora y el motivo. Se puede reactivar."
      etiquetaEnviar="Dar de baja"
      enviando={enviando}
      error={error}
      puedeEnviar={motivoVale && confirmado}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      <Campo
        etiqueta="Motivo de la baja"
        name="motivo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={300}
        ayuda={`Obligatorio, al menos ${String(LONGITUD_MINIMA_DEL_MOTIVO_DE_BAJA)} caracteres. Queda en la auditoría.`}
        error={
          motivo !== '' && !motivoVale
            ? `Escribe al menos ${String(LONGITUD_MINIMA_DEL_MOTIVO_DE_BAJA)} caracteres`
            : undefined
        }
      />
      <label className="flex items-start gap-2 text-secundario text-texto">
        <input
          type="checkbox"
          name="confirmacion"
          checked={confirmado}
          onChange={(e) => setConfirmado(e.target.checked)}
          className="mt-1"
        />
        <span>Confirmo la baja de «{equipo?.nombre ?? ''}» en esta copropiedad.</span>
      </label>
    </DialogoDeFormulario>
  );
};

/** Los equipos dados de baja, con la acción de volver a ponerlos en servicio. */
export const EquiposDadosDeBaja = ({
  copropiedadId,
  equipos,
  cargando = false,
  alAvisar,
}: {
  readonly copropiedadId: string;
  readonly equipos: readonly Equipo[];
  readonly cargando?: boolean;
  readonly alAvisar?: (texto: string) => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reactivar = async (e: Equipo): Promise<void> => {
    setEnCurso(e.id);
    setError(null);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/equipos/{equipoId}/reactivacion', {
          params: { path: { id: copropiedadId, equipoId: e.id } },
        }),
      );
      await invalidarEquipos(consultas, copropiedadId);
      alAvisar?.(`${e.nombre} vuelve a estar en servicio.`);
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo reactivar el equipo.');
    } finally {
      setEnCurso(null);
    }
  };

  const columnas: readonly Columna<Equipo>[] = [
    {
      clave: 'equipo',
      titulo: 'Equipo',
      texto: (e) => `${e.nombre} ${e.tipo}`,
      celda: (e) => (
        <div>
          <p className="font-medium text-texto">{e.nombre}</p>
          <p className="text-secundario text-texto-apagado">{e.tipo.replace(/_/g, ' ')}</p>
        </div>
      ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      celda: () => <Distintivo tono="neutro">Dado de baja</Distintivo>,
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alineacion: 'derecha',
      celda: (e) => (
        <Boton
          variante="secundario"
          tamano="sm"
          cargando={enCurso === e.id}
          disabled={enCurso !== null}
          onClick={() => void reactivar(e)}
        >
          Reactivar
        </Boton>
      ),
    },
  ];

  return (
    <>
      {error !== null ? (
        <p
          role="alert"
          className="mb-3 rounded-md border border-peligro bg-peligro-suave px-3 py-2 text-secundario text-peligro-texto"
        >
          {error}
        </p>
      ) : null}
      <TablaDeDatos
        titulo="Equipos dados de baja"
        columnas={columnas}
        filas={equipos}
        claveDeFila={(e) => e.id}
        cargando={cargando}
        vacio={{
          titulo: 'Ningún equipo dado de baja',
          descripcion: 'Los equipos que se den de baja aparecerán aquí y se podrán reactivar.',
        }}
      />
    </>
  );
};
