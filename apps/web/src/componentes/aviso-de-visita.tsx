'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { UserRoundCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Boton } from '@/componentes/ui/boton';
import { RechazoDeVisita, sePuedeRechazar } from '@/componentes/rechazo-de-visita';
import { clavesDeVisitas } from '@/lib/api/visitas';
import { abrirCanal } from '@/lib/sse/canal';
import type { AvisoDeVisitaEnVivo } from '@/lib/sse/visitas';

const horaDe = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

/**
 * F2 (15-L) · LA VISITA NUEVA, EN VIVO, PARA PORTERÍA Y SUPERADMINISTRACIÓN.
 *
 * La visita nace autorizada; este aviso es la oportunidad de rechazarla. Se
 * pone delante de lo que se esté mirando, como el timbre, con dos salidas:
 * «Entendido» lo cierra y «Rechazar» pide el motivo. Cualquier aviso —nueva o
 * anulada— refresca la lista de Visitantes, que es la verdad.
 */
export const AvisoDeVisita = ({
  copropiedadId,
  suscribir = abrirCanal,
}: {
  readonly copropiedadId: string;
  /** Inyectable para probar sin `EventSource`. */
  readonly suscribir?: typeof abrirCanal;
}): JSX.Element | null => {
  const consultas = useQueryClient();
  const [aviso, setAviso] = useState<AvisoDeVisitaEnVivo | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [resumen, setResumen] = useState<string | null>(null);

  useEffect(() => {
    if (suscribir === abrirCanal && typeof EventSource === 'undefined') return undefined;
    return suscribir({
      copropiedadId,
      mensajes: {
        evento: () => undefined,
        alerta: () => undefined,
        estado: () => undefined,
        recuperados: () => undefined,
        visita: (a) => {
          void consultas.invalidateQueries({ queryKey: clavesDeVisitas.raiz(copropiedadId) });
          if (a.tipo === 'nueva') {
            setAviso(a);
            setResumen(null);
          } else {
            setAviso((actual) =>
              actual?.visita.autorizacionId === a.visita.autorizacionId ? null : actual,
            );
          }
        },
      },
    });
  }, [copropiedadId, suscribir, consultas]);

  if (resumen !== null) {
    return (
      <div
        role="status"
        className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-tarjeta border border-borde bg-superficie p-4 shadow-lg sm:inset-x-auto sm:right-4"
      >
        <p className="text-secundario text-texto">{resumen}</p>
        <div className="mt-2 flex justify-end">
          <Boton variante="secundario" tamano="sm" onClick={() => setResumen(null)}>
            Cerrar
          </Boton>
        </div>
      </div>
    );
  }
  if (aviso === null) return null;
  const v = aviso.visita;

  if (rechazando) {
    return (
      <RechazoDeVisita
        copropiedadId={copropiedadId}
        visita={v}
        alTerminar={(texto) => {
          setRechazando(false);
          if (texto !== null) {
            setAviso(null);
            setResumen(texto);
          }
        }}
      />
    );
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="aviso-de-visita-titulo"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-tarjeta border-2 border-marca-texto bg-superficie p-4 shadow-lg sm:inset-x-auto sm:right-4"
    >
      <div className="flex items-start gap-3">
        <UserRoundCheck
          className="mt-0.5 h-6 w-6 shrink-0 text-marca-texto"
          aria-hidden="true"
          strokeWidth={1.75}
        />
        <div className="min-w-0 flex-1">
          <p id="aviso-de-visita-titulo" className="text-titulo font-semibold text-texto">
            Nueva visita para {v.vivienda}
          </p>
          <p className="mt-1 text-secundario text-texto">
            {v.visitante} · de {horaDe(v.desde)} a {horaDe(v.hasta)}
          </p>
          <p className="mt-1 text-secundario text-texto-apagado">
            Generada por {v.generadaPor ?? 'la app del residente'}. Ya está autorizada.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" tamano="sm" onClick={() => setAviso(null)}>
          Entendido
        </Boton>
        {sePuedeRechazar(v) ? (
          <Boton variante="peligro" tamano="sm" onClick={() => setRechazando(true)}>
            Rechazar
          </Boton>
        ) : null}
      </div>
    </div>
  );
};
