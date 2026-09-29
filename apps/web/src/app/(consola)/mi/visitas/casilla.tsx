'use client';

import type { JSX } from 'react';
import type { TextoDeLaCasilla } from '@ncr/contracts';
import { Ayuda } from '@/componentes/ui/ayuda';
import { textoDeLaCasilla } from '@/lib/api/visitas';
import type { MiVisitaGenerada } from '@/lib/api/residente';
import { MOTIVOS_DE_FOTO } from '../../visitantes/generar-autorizacion';

/**
 * La declaración que marca el residente (ADR-032), con el MISMO texto que la
 * app Flutter (`apps/mobile/lib/dominio/casilla_de_la_foto.dart`).
 *
 * La consola de operación lo lee de `GET …/visitas/casilla`, pero esa ruta la
 * API sólo se la da a los roles de operación, no al residente; y la ruta del
 * residente (`POST …/mi/visitas`) recibe sólo el booleano y sella la versión
 * en el servidor, igual que con la app. Por eso aquí la plantilla es una
 * constante y no una consulta: la misma que la app compila. Si la API abre la
 * ruta al residente, esto pasa a ser una consulta sin tocar los formularios.
 * [SUPUESTO] S-151.
 */
export const CASILLA_DEL_RESIDENTE: TextoDeLaCasilla = {
  plantilla: 'Declaro que {visitante} me autorizó a usar su foto para su ingreso al conjunto',
  marcador: '{visitante}',
  version: 'app',
};

export const CasillaDeLaFoto = ({
  nombre,
  marcada,
  alCambiar,
}: {
  readonly nombre: string;
  readonly marcada: boolean;
  readonly alCambiar: (marcada: boolean) => void;
}): JSX.Element => (
  <label className="flex items-start gap-2">
    <input
      type="checkbox"
      name="casilla"
      checked={marcada}
      onChange={(e) => alCambiar(e.target.checked)}
      required
    />
    <span className="text-secundario text-texto">
      {textoDeLaCasilla(CASILLA_DEL_RESIDENTE, nombre)}
      <Ayuda texto="Márcala sólo si el visitante te lo autorizó. Queda registrado quién la marcó y cuándo, y la foto se borra de los equipos cuando termina la visita." />
    </span>
  </label>
);

/** Lo que el servidor contestó al registrar: 200 con motivo, o creada con su sincronización. */
export const desenlaceDe = (
  r: MiVisitaGenerada,
): { readonly error?: string; readonly exito?: string } => {
  if (!r.creada) {
    if (r.motivosDeFoto.length > 0) {
      const porque = r.motivosDeFoto.map((m) => MOTIVOS_DE_FOTO[m] ?? m).join(', ');
      return { error: `La foto no sirve: ${porque}. Toma otra.` };
    }
    return { error: r.explicacion ?? 'El conjunto no admitió la visita.' };
  }
  if (r.repetida) {
    return {
      exito:
        'Esta visita ya estaba registrada: se había enviado antes y el conjunto la conservó. No se creó una segunda.',
    };
  }
  const equipos =
    r.equipos === 0
      ? 'El conjunto no tiene equipos que reconozcan rostros: la visita vale por documento y placa.'
      : `Foto enviada a ${String(r.sincronizadas)} de ${String(r.equipos)} equipos${r.fallidas > 0 ? `; ${String(r.fallidas)} no la aceptaron` : ''}.`;
  return {
    exito: `Visita autorizada. La portería ya puede verla. ${equipos}${r.avisoDeSincronizacion === null ? '' : ` ${r.avisoDeSincronizacion}`}`,
  };
};
