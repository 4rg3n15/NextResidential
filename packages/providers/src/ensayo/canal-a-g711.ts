import { rutaPara, opcionesDeEscritura } from '../equipo/catalogo-de-rutas';
import type { ClienteDeEquipo } from '../equipo/cliente';
import { canalesDe } from './respaldo-de-configuracion';
import { esG711 } from './diagnostico-de-audio';
import type { FamiliaDeAudio } from '../videoportero/intercom-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B4 (15-S2) · UN CANAL DE AUDIO QUE NO ES G.711, PASADO A G.711 · NUNCA EN SILENCIO
 *
 * La consola sólo habla G.711. Si la terminal declara otro formato, hay dos
 * salidas: transcodificar en la API (no se hace en esta ronda: DT-15S2-03) o
 * pasar SU canal a G.711 µ-law, que es lo que hace esto, y sólo si:
 *
 *  · el respaldo del equipo ya está escrito (lo comprueba quien llama, con el
 *    mismo formato que `pnpm sitio:ensayo -- --capturar`, que lo revierte);
 *  · una persona lo AUTORIZA escribiendo «s» a una pregunta que dice qué
 *    cambia, de qué a qué, y que lo autoriza el cliente;
 *  · el equipo, releído, dice G.711 µ-law. Si no, se dice, no se finge.
 *
 * Se escribe el documento del canal ENTERO (estos esquemas no admiten campos
 * sueltos) con sólo `audioCompressionType` cambiado.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const DESTINO_G711 = 'G.711ulaw';

/** El documento del canal con el formato cambiado a G.711 µ-law; `null` si no lo declara. */
export const documentoConG711 = (documento: string): string | null =>
  /<audioCompressionType>[^<]*<\/audioCompressionType>/.test(documento)
    ? documento.replace(
        /<audioCompressionType>[^<]*<\/audioCompressionType>/,
        `<audioCompressionType>${DESTINO_G711}</audioCompressionType>`,
      )
    : null;

const formatoDe = (documento: string): string | null =>
  /<audioCompressionType>([^<]*)<\/audioCompressionType>/.exec(documento)?.[1] ?? null;

export interface PasoAG711 {
  readonly cambiado: boolean;
  readonly fallo: boolean;
  readonly lineas: readonly string[];
}

export const pasarCanalAG711 = async (o: {
  readonly cliente: Pick<ClienteDeEquipo, 'pedir'>;
  readonly familia: FamiliaDeAudio;
  readonly canal: number;
  readonly confirmar: (pregunta: string) => Promise<boolean | null>;
}): Promise<PasoAG711> => {
  const leer = rutaPara('leer los canales de audio bidireccional del equipo', o.familia);
  const antes = await o.cliente.pedir('GET', leer.ruta);
  const documento = antes.ok ? canalesDe(antes.cuerpo).get(o.canal) : undefined;
  const formato = documento === undefined ? null : formatoDe(documento);
  if (documento === undefined) {
    return { cambiado: false, fallo: true, lineas: ['✗ no se pudo leer el canal: nada cambió'] };
  }
  if (esG711(formato) !== null) {
    return {
      cambiado: false,
      fallo: false,
      lineas: [`· el canal ya es ${formato ?? ''}: nada que hacer`],
    };
  }
  const nuevo = documentoConG711(documento);
  if (nuevo === null) {
    return {
      cambiado: false,
      fallo: true,
      lineas: ['✗ el canal no declara su formato: nada cambió'],
    };
  }
  const si = await o.confirmar(
    `Esto CAMBIA la configuración del equipo: el canal ${String(o.canal)} pasa de ` +
      `${formato ?? 'sin formato'} a ${DESTINO_G711}. El respaldo ya está guardado y lo ` +
      'revierte `pnpm sitio:ensayo -- --restaurar=<carpeta>`. ¿Lo AUTORIZA el cliente?',
  );
  if (si !== true) {
    return { cambiado: false, fallo: false, lineas: ['· sin autorización: el equipo no se tocó'] };
  }
  const escribir = rutaPara('configurar un canal de audio bidireccional', o.familia, o.canal);
  const r = await o.cliente.pedir(
    'PUT',
    escribir.ruta,
    { tipo: 'application/xml', contenido: nuevo },
    opcionesDeEscritura(escribir),
  );
  const releido = await o.cliente.pedir('GET', leer.ruta);
  const ahora = releido.ok ? formatoDe(canalesDe(releido.cuerpo).get(o.canal) ?? '') : null;
  const ok = r.ok && esG711(ahora) === 'ulaw';
  return {
    cambiado: ok,
    fallo: !ok,
    lineas: [
      ok
        ? `✓ canal ${String(o.canal)}: ${formato ?? ''} → ${DESTINO_G711} (releído del equipo)`
        : `✗ el equipo contestó HTTP ${String(r.estado)} y releído dice ${ahora ?? 'nada'}: ` +
          'no se da por cambiado; revierta con el respaldo si hace falta',
    ],
  };
};
