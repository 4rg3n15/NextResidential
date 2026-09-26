'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Equipo } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-11 · LA ATESTACIÓN DEL INSTALADOR, EN LA CONSOLA
 *
 * Sólo la ve el superadministrador. Pide lo que se probó FRENTE A LA CÁMARA:
 * una placa de su lista blanca, una desconocida, que ninguna abrió y qué vio.
 * La API la ata al firmware actual del equipo.
 *
 * Y en la fila, la atestación nunca es verde: vigente es ÁMBAR —se opera por
 * una firma, no porque la API lo confirme—; sin efecto es rojo, con el motivo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const distintivoDeAtestacion = (
  e: Pick<Equipo, 'atestacion'>,
): { tono: TonoDeDistintivo; texto: string } | null => {
  const a = e.atestacion;
  if (a === null) return null;
  return a.vigente
    ? { tono: 'aviso', texto: `Operada por atestación del instalador · firmware ${a.firmware}` }
    : { tono: 'peligro', texto: `Atestación sin efecto: ${a.motivoSinEfecto ?? 'sin motivo'}` };
};

export const DialogoDeAtestacion = ({
  copropiedadId,
  equipo,
  alCerrar,
  alAtestar,
}: {
  readonly copropiedadId: string;
  readonly equipo: Equipo | null;
  readonly alCerrar: () => void;
  readonly alAtestar: (texto: string) => void;
}): JSX.Element => {
  const clientes = useQueryClient();
  const [blanca, setBlanca] = useState('');
  const [desconocida, setDesconocida] = useState('');
  const [ningunaAbrio, setNingunaAbrio] = useState(false);
  const [evidencia, setEvidencia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const listo =
    blanca.trim().length >= 4 &&
    desconocida.trim().length >= 4 &&
    ningunaAbrio &&
    evidencia.trim().length >= 20;

  const cerrar = (): void => {
    setBlanca('');
    setDesconocida('');
    setNingunaAbrio(false);
    setEvidencia('');
    setError(undefined);
    alCerrar();
  };

  const enviar = async (): Promise<void> => {
    if (equipo === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/equipos/{equipoId}/atestacion', {
          params: { path: { id: copropiedadId, equipoId: equipo.id } },
          body: {
            placaEnListaBlanca: blanca,
            placaDesconocida: desconocida,
            ningunaAbrio: true,
            evidencia,
          },
        }),
      );
      await clientes.invalidateQueries({ queryKey: ['dispositivos', copropiedadId] });
      alAtestar(
        `${equipo.nombre}: atestación registrada para el firmware ${r.firmware}. Se operará en ` +
          'ámbar: la API sigue sin confirmar que no decida sola.',
      );
      cerrar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo registrar la atestación');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={equipo !== null}
      titulo={`Atestación del instalador · ${equipo?.nombre ?? ''}`}
      descripcion={
        `Frente a la cámara, con el firmware ${equipo?.firmware ?? 'desconocido'}: pase un ` +
        'vehículo con una placa de su lista blanca y otro con una placa desconocida. Registre ' +
        'sólo si NINGUNO abrió. Queda a su nombre y no se puede modificar.'
      }
      etiquetaEnviar="Registrar atestación"
      enviando={enviando}
      {...(error === undefined ? {} : { error })}
      puedeEnviar={listo}
      alEnviar={() => void enviar()}
      alCancelar={cerrar}
    >
      <Campo
        etiqueta="Placa de la lista blanca del equipo"
        value={blanca}
        maxLength={12}
        autoComplete="off"
        onChange={(e) => setBlanca(e.target.value)}
      />
      <Campo
        etiqueta="Placa desconocida"
        value={desconocida}
        maxLength={12}
        autoComplete="off"
        onChange={(e) => setDesconocida(e.target.value)}
      />
      <label className="flex items-start gap-2 text-secundario">
        <input
          type="checkbox"
          checked={ningunaAbrio}
          onChange={(e) => setNingunaAbrio(e.target.checked)}
        />
        <span>Ninguna de las dos abrió la barrera.</span>
      </label>
      <label className="block space-y-1.5 text-secundario">
        <span className="font-medium text-texto">Lo que vio (hora, carril, qué pasó)</span>
        <textarea
          value={evidencia}
          maxLength={2000}
          rows={4}
          onChange={(e) => setEvidencia(e.target.value)}
          className="block w-full rounded-campo border border-borde bg-campo px-3 py-2 text-texto"
        />
      </label>
    </DialogoDeFormulario>
  );
};
