/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS PLAZAS DE LA VIVIENDA, EN MANOS DE SU TITULAR · RONDA 15-W (D-W10, D4 bis)
 *
 * El titular añade plazas hasta el tope —4 por omisión, contándose a sí mismo
 * (S-15W-03)— y retira las LIBRES; nunca la 1, que es la suya. Más plazas las
 * autoriza el superadministrador subiendo el tope de ESA vivienda. La decisión
 * final del tope la toma la base (`tg_tope_de_plazas`, 0056): el adaptador
 * traduce su rechazo, no lo adivina.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const PLAZAS_DEL_TITULAR = Symbol('PLAZAS_DEL_TITULAR');

export interface CupoDePlazas {
  readonly activas: number;
  readonly tope: number;
  /** La cuenta que pregunta es el titular (`primer_residente_id`) de la vivienda. */
  readonly esTitular: boolean;
  /** Si el tope es el de la vivienda (lo subió el superadministrador) o el de su copropiedad. */
  readonly topePropio: boolean;
}

export type PlazaAnadida = 'ANADIDA' | 'TOPE_ALCANZADO';

export type PlazaRetiradaPorElTitular =
  | 'RETIRADA'
  | 'NO_ENCONTRADA'
  | 'OCUPADA'
  | 'ES_LA_DEL_TITULAR';

export type TopeCambiado = 'CAMBIADO' | 'NO_ENCONTRADA' | 'BAJO_LAS_PLAZAS';

export interface PlazasDelTitular {
  cupo(copropiedadId: string, viviendaId: string, usuarioId: string): Promise<CupoDePlazas>;
  /** Una plaza libre más, al final, en nombre del titular. La base decide el tope. */
  anadir(copropiedadId: string, viviendaId: string, usuarioId: string): Promise<PlazaAnadida>;
  retirar(
    copropiedadId: string,
    viviendaId: string,
    plazaId: string,
    motivo: string,
    usuarioId: string,
  ): Promise<PlazaRetiradaPorElTitular>;
  /** Superadministrador · el tope propio de una vivienda (`null` = el de su copropiedad). */
  cambiarTope(
    copropiedadId: string,
    viviendaId: string,
    tope: number | null,
    actorId: string,
  ): Promise<TopeCambiado>;
}
