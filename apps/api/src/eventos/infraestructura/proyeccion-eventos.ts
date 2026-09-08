import type { Acceso, FiltroDeEventos } from '@ncr/domain-core';
import type { EventoRegistrado, PaginaDeEventos } from '../aplicacion/puertos';

/**
 * Proyección del agregado a la fila del histórico, y la paginación por cursor.
 *
 * Vive aparte de los adaptadores porque los dos —memoria y PostgreSQL— tienen
 * que producir EXACTAMENTE la misma forma y el mismo orden. Duplicar el mapeo
 * en cada uno es cómo se separan dos implementaciones del mismo puerto sin que
 * ninguna prueba lo note (LSP, §2.3).
 */
export const mapearAcceso = (acceso: Acceso): EventoRegistrado => ({
  id: acceso.id,
  copropiedadId: acceso.copropiedadId,
  ocurridoEn: acceso.ocurridoEn,
  tipo: acceso.tipo,
  resultado: acceso.resultado,
  motivo: acceso.motivo,
  metodo: acceso.metodo,
  personaId: acceso.personaId,
  viviendaId: acceso.viviendaId,
  zonaId: acceso.zonaId,
  dispositivoId: acceso.dispositivoId,
  placaDetectada: acceso.placaDetectada,
  confianza: acceso.confianza,
  reglaAplicada: acceso.reglaAplicada,
  versionReglas: acceso.versionDeReglas.numero,
  operadorId: acceso.operadorId,
  motivoManual: acceso.motivoManual,
  evidenciaId: acceso.evidenciaId,
  decididoPorEdge: acceso.decididoPorEdge,
});

/**
 * Cursor **de conjunto de claves**, no de desplazamiento.
 *
 * Un `OFFSET` sobre una tabla que crece por la cabecera salta filas: entre la
 * página 1 y la 2 entran eventos nuevos y la 2 empieza donde ya se leyó. El
 * histórico se ordena por `(ocurrido_en DESC, id DESC)` y el cursor lleva ese
 * par, así que la página siguiente continúa exactamente donde acabó la anterior
 * aunque la tabla haya crecido entre medias.
 */
export const cursorDe = (fila: EventoRegistrado): string =>
  Buffer.from(`${fila.ocurridoEn.toISOString()}|${fila.id}`, 'utf8').toString('base64url');

export interface CursorAbierto {
  readonly ocurridoEn: Date;
  readonly id: string;
}

export const leerCursor = (cursor: string): CursorAbierto | null => {
  const crudo = Buffer.from(cursor, 'base64url').toString('utf8');
  const corte = crudo.lastIndexOf('|');
  if (corte < 0) return null;
  const instante = new Date(crudo.slice(0, corte));
  if (Number.isNaN(instante.getTime())) return null;
  return { ocurridoEn: instante, id: crudo.slice(corte + 1) };
};

const anteriorA = (fila: EventoRegistrado, c: CursorAbierto): boolean => {
  const delta = fila.ocurridoEn.getTime() - c.ocurridoEn.getTime();
  return delta < 0 || (delta === 0 && fila.id < c.id);
};

/** Aplica el filtro y pagina. Función pura sobre la lista que reciba. */
export const filtrarYPaginar = (
  filas: readonly EventoRegistrado[],
  filtro: FiltroDeEventos,
): PaginaDeEventos => {
  const cursor = filtro.cursor === null ? null : leerCursor(filtro.cursor);

  const coincide = (f: EventoRegistrado): boolean =>
    f.copropiedadId === filtro.copropiedadId &&
    f.ocurridoEn.getTime() >= filtro.desde.getTime() &&
    f.ocurridoEn.getTime() < filtro.hasta.getTime() &&
    (filtro.viviendaId === null || f.viviendaId === filtro.viviendaId) &&
    (filtro.personaId === null || f.personaId === filtro.personaId) &&
    (filtro.dispositivoId === null || f.dispositivoId === filtro.dispositivoId) &&
    (filtro.zonaId === null || f.zonaId === filtro.zonaId) &&
    (filtro.tipo === null || f.tipo === filtro.tipo) &&
    (filtro.resultado === null || f.resultado === filtro.resultado) &&
    (filtro.motivo === null || f.motivo === filtro.motivo) &&
    (cursor === null || anteriorA(f, cursor));

  const ordenadas = filas
    .filter(coincide)
    .sort(
      (a, b) =>
        b.ocurridoEn.getTime() - a.ocurridoEn.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );

  const pagina = ordenadas.slice(0, filtro.tamanoPagina);
  const ultima = pagina[pagina.length - 1];
  return {
    filas: pagina,
    siguiente:
      ultima !== undefined && ordenadas.length > filtro.tamanoPagina ? cursorDe(ultima) : null,
  };
};
