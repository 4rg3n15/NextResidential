'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { PhoneIncoming } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { abrirCanal } from '@/lib/sse/canal';
import type { LlamadaEntrante } from '@/lib/sse/llamadas';

/**
 * A4 (15-E) · LA LLAMADA DEL VIDEOPORTERO, EMERGENTE.
 *
 * Se suscribe al canal de tiempo real de la copropiedad y, cuando llega una
 * llamada, la pone DELANTE de lo que el operador esté mirando: es lo que RN-18
 * y KPI-25 piden de un evento crítico, y una llamada sin nadie al otro lado
 * es exactamente el caso que CU-03 quiere evitar. «Atender» se la entrega a la
 * pantalla —que abre el audio y la ficha de la vivienda—; «Ignorar» la cierra
 * y queda en la bitácora de la API que se avisó.
 *
 * Una sola llamada a la vez: la última pisa a la anterior, que ya nadie
 * atendió. No es una cola —la cola es la de atención— sino un timbre.
 */
export const AvisoDeLlamada = ({
  copropiedadId,
  alAtender,
  suscribir = abrirCanal,
}: {
  readonly copropiedadId: string;
  readonly alAtender: (llamada: LlamadaEntrante) => void;
  /** Inyectable para probar sin `EventSource`. */
  readonly suscribir?: typeof abrirCanal;
}): JSX.Element | null => {
  const [llamada, setLlamada] = useState<LlamadaEntrante | null>(null);

  useEffect(() => {
    // Sin `EventSource` (render de servidor, banco de pruebas sin navegador)
    // no hay canal que abrir, y no se finge uno.
    if (suscribir === abrirCanal && typeof EventSource === 'undefined') return undefined;
    const baja = suscribir({
      copropiedadId,
      mensajes: {
        evento: () => undefined,
        alerta: () => undefined,
        estado: () => undefined,
        recuperados: () => undefined,
        llamada: setLlamada,
      },
    });
    return baja;
  }, [copropiedadId, suscribir]);

  if (llamada === null) return null;

  const hora = new Date(llamada.ocurridoEn).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="aviso-de-llamada-titulo"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-tarjeta border-2 border-marca-texto bg-superficie p-4 shadow-lg sm:inset-x-auto sm:right-4"
    >
      <div className="flex items-start gap-3">
        <PhoneIncoming
          className="mt-0.5 h-6 w-6 shrink-0 text-marca-texto"
          aria-hidden="true"
          strokeWidth={1.75}
        />
        <div className="min-w-0 flex-1">
          <p id="aviso-de-llamada-titulo" className="text-titulo font-semibold text-texto">
            {llamada.clase === 'timbre' ? 'Timbre' : 'Llamada'} desde{' '}
            {llamada.vivienda ?? 'una vivienda sin identificar'}
          </p>
          <p className="mt-1 text-secundario text-texto-apagado">
            {llamada.origen ?? 'Sin origen declarado'} · {hora} · equipo{' '}
            <span className="font-mono">{llamada.dispositivoId.slice(0, 8)}</span>
          </p>
          {llamada.viviendaId === null ? (
            <p className="mt-1 text-distintivo text-aviso-texto">
              El padrón no reconoce esta unidad: compruebe el número en el equipo.
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" tamano="sm" onClick={() => setLlamada(null)}>
          Ignorar
        </Boton>
        <Boton
          variante="primario"
          tamano="sm"
          onClick={() => {
            alAtender(llamada);
            setLlamada(null);
          }}
        >
          Atender
        </Boton>
      </div>
    </div>
  );
};
