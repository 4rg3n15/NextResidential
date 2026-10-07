/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · EL ESTADO DE «MI ROSTRO», SIN E/S
 *
 * Lo que la app pinta en «Perfil → Mi rostro» sale de tres hechos que lee la
 * infraestructura: la plantilla VIVA de residente de la persona (a lo sumo
 * una, `plantillas_residente_viva_uk`), en qué equipos con biblioteca de
 * rostros está, y cuántas retiradas quedan por confirmar. Ni la imagen ni el
 * vector entran aquí: no hay campo donde ponerlos.
 *
 *   sin_rostro  · nada vivo y nada que retirar
 *   en_retiro   · nada vivo, y algún equipo todavía por confirmar la retirada
 *   por_vencer  · vivo y a DIAS_PARA_RENOVAR días o menos de su supresión
 *   pendiente   · vivo y en ningún equipo todavía (o no hay equipos)
 *   parcial     · vivo, en unos equipos sí y en otros no
 *   activa      · vivo y en todos los equipos con rostros
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type EstadoDelRostro =
  | 'sin_rostro'
  | 'pendiente'
  | 'activa'
  | 'parcial'
  | 'por_vencer'
  | 'en_retiro';

/** [SUPUESTO] S-15X-02 · con un mes de aviso da tiempo a renovar sin quedarse sin rostro. */
export const DIAS_PARA_RENOVAR = 30;

export type EstadoEnEquipo = 'sincronizada' | 'pendiente' | 'fallida';

export interface RostroLeido {
  readonly plantilla: {
    readonly plantillaId: string;
    readonly calidad: number;
    readonly registradoEn: Date;
    readonly venceEn: Date;
  } | null;
  readonly equipos: readonly { readonly nombre: string; readonly estado: EstadoEnEquipo }[];
  readonly retiradasPendientes: number;
}

export interface EstadoDeMiRostro {
  readonly estado: EstadoDelRostro;
  readonly calidad: number | null;
  readonly registradoEn: string | null;
  readonly venceEn: string | null;
  readonly diasParaVencer: number | null;
  readonly equiposConRostro: number;
  readonly equiposConMiRostro: number;
  readonly equipos: readonly { readonly nombre: string; readonly estado: EstadoEnEquipo }[];
}

const DIA_MS = 24 * 3600 * 1000;

const estadoDe = (r: RostroLeido, dias: number | null): EstadoDelRostro => {
  if (r.plantilla === null) return r.retiradasPendientes > 0 ? 'en_retiro' : 'sin_rostro';
  if (dias !== null && dias <= DIAS_PARA_RENOVAR) return 'por_vencer';
  const conMiRostro = r.equipos.filter((e) => e.estado === 'sincronizada').length;
  if (conMiRostro === 0) return 'pendiente';
  return conMiRostro < r.equipos.length ? 'parcial' : 'activa';
};

export const estadoDelRostro = (r: RostroLeido, ahora: Date): EstadoDeMiRostro => {
  const p = r.plantilla;
  const dias =
    p === null ? null : Math.max(0, Math.ceil((p.venceEn.getTime() - ahora.getTime()) / DIA_MS));
  return {
    estado: estadoDe(r, dias),
    calidad: p?.calidad ?? null,
    registradoEn: p?.registradoEn.toISOString() ?? null,
    venceEn: p?.venceEn.toISOString() ?? null,
    diasParaVencer: dias,
    equiposConRostro: r.equipos.length,
    equiposConMiRostro: r.equipos.filter((e) => e.estado === 'sincronizada').length,
    equipos: r.equipos.map((e) => ({ nombre: e.nombre, estado: e.estado })),
  };
};
