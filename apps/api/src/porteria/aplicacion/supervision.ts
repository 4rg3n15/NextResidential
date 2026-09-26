import type {
  BitacoraDeIdentidad,
  HechoRegistrado,
  TipoDeHecho,
} from '../../comun/bitacora-de-identidad';
import type { DirectorioDeCuentas } from '../../cuentas';

export interface HechoConNombres extends HechoRegistrado {
  readonly nombreUsuario: string | null;
  readonly nombreActor: string | null;
}

export const LIMITE_DE_HECHOS = 500;

/**
 * PANEL DE SUPERVISIÓN · lo que el superadministrador lee de la bitácora
 * append-only: ingresos y salidas con su origen, patrullajes con su duración,
 * turnos, restablecimientos y rechazos. Los nombres se resuelven por el
 * directorio de cuentas; el correo no aparece en ningún campo.
 */
export class PanelDeSupervision {
  constructor(
    private readonly bitacora: BitacoraDeIdentidad,
    private readonly cuentas: DirectorioDeCuentas,
  ) {}

  async hechos(
    copropiedadId: string,
    desde: Date,
    hasta: Date,
    tipos: readonly TipoDeHecho[] | undefined,
  ): Promise<readonly HechoConNombres[]> {
    const hechos = await this.bitacora.consultar({
      copropiedadId,
      desde,
      hasta,
      ...(tipos === undefined ? {} : { tipos }),
      limite: LIMITE_DE_HECHOS,
    });
    const ids = [
      ...new Set(
        hechos.flatMap((h) => [h.usuarioId, h.actorId]).filter((x): x is string => x !== null),
      ),
    ];
    const nombres = new Map(
      (await this.cuentas.resumenes(copropiedadId, ids)).map((c) => [c.usuarioId, c.nombre]),
    );
    return hechos.map((h) => ({
      ...h,
      nombreUsuario: h.usuarioId === null ? null : (nombres.get(h.usuarioId) ?? null),
      nombreActor: h.actorId === null ? null : (nombres.get(h.actorId) ?? null),
    }));
  }
}
