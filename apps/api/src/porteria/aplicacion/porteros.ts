import { exito, fallo } from '@ncr/domain-core';
import type { Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { BitacoraDeIdentidad } from '../../comun/bitacora-de-identidad';
import type { CrearCuentaPorUsuario, DirectorioDeCuentas, ResumenDeCuenta } from '../../cuentas';
import type { MotivoDeCierre, SesionDePorteria } from '../dominio/sesion-de-porteria';
import type {
  PerfilDePortero,
  RepositorioDePerfiles,
  RepositorioDeSesiones,
  RepositorioDeTurnos,
  TurnoRegistrado,
} from './puertos';

export interface DatosDelPortero {
  readonly nombre: string;
  readonly telefono: string | null;
  readonly correoContacto: string | null;
  readonly porteria: string | null;
  readonly sectores: readonly string[];
  /** H2 (15-L) · documento de identidad. `undefined` en la edición: no se toca. */
  readonly documento?: string;
}

/**
 * H2 (15-L, ADR-031) · nombre, documento y contraseña temporal. El USUARIO ya
 * no lo elige nadie: el portero entra con el número que le asigna el pool.
 */
export interface AltaDelPortero extends DatosDelPortero {
  readonly documento: string;
  readonly contrasenaInicial: string;
}

/** Documento: mayúsculas, sin espacios ni puntos; 3 a 20 letras, dígitos o guiones. */
export const documentoDePortero = (texto: string): string | null => {
  const d = texto.normalize('NFKC').toUpperCase().replace(/[\s.]/g, '');
  return /^[0-9A-Z-]{3,20}$/.test(d) ? d : null;
};

export interface FichaDelPortero {
  readonly cuenta: ResumenDeCuenta;
  readonly perfil: PerfilDePortero;
  readonly turnoVigente: TurnoRegistrado | null;
  readonly sesionAbierta: SesionDePorteria | null;
}

export type RechazoDePortero =
  | { readonly motivo: 'FORMATO'; readonly detalle: string }
  | { readonly motivo: 'DUPLICADO' }
  | { readonly motivo: 'PROVEEDOR' }
  | { readonly motivo: 'NO_ENCONTRADO' }
  | { readonly motivo: 'CUPO' }
  | { readonly motivo: 'POOL_AGOTADO' };

/** Lo único que la baja necesita del control de sesiones: cerrar una, con su motivo. */
export interface CierreDeSesion {
  cerrar(s: SesionDePorteria, motivo: MotivoDeCierre, actorId: string): Promise<void>;
}

/**
 * PORTEROS · alta, datos y baja por el superadministrador; perfil de solo
 * lectura para el propio portero (E-02). El número lo asigna el pool (ADR-031);
 * la contraseña inicial la escribe quien da de alta, y la cuenta nace obligada
 * a cambiarla.
 */
export class GestionDePorteros {
  constructor(
    private readonly crearCuenta: CrearCuentaPorUsuario,
    private readonly cuentas: DirectorioDeCuentas,
    private readonly perfiles: RepositorioDePerfiles,
    private readonly turnos: RepositorioDeTurnos,
    private readonly sesiones: RepositorioDeSesiones,
    private readonly bitacora: BitacoraDeIdentidad,
    private readonly reloj: Reloj,
    private readonly cierre: CierreDeSesion,
  ) {}

  async alta(
    ctx: ContextoTenant,
    copropiedadId: string,
    a: AltaDelPortero,
  ): Promise<Resultado<{ readonly usuarioId: string; readonly numero: number }, RechazoDePortero>> {
    const documento = documentoDePortero(a.documento);
    if (documento === null) {
      return fallo({
        motivo: 'FORMATO',
        detalle: 'El documento admite de 3 a 20 letras, números o guiones',
      });
    }
    const creada = await this.crearCuenta.ejecutar(
      {
        copropiedadId,
        nombre: a.nombre,
        telefono: a.telefono,
        rol: 'portero',
        contrasenaInicial: a.contrasenaInicial,
      },
      ctx.usuarioId,
    );
    if (!creada.ok) return creada;
    const { usuarioId, numeroDePortero } = creada.valor;
    if (numeroDePortero === null) throw new Error('el alta del portero no recibió número');
    await this.perfiles.guardar(
      {
        usuarioId,
        copropiedadId,
        porteria: a.porteria,
        sectores: a.sectores,
        correoContacto: a.correoContacto,
        documento,
      },
      ctx.usuarioId,
    );
    await this.anotar('alta_de_portero', ctx, copropiedadId, usuarioId);
    return exito({ usuarioId, numero: numeroDePortero });
  }

  async editar(
    ctx: ContextoTenant,
    copropiedadId: string,
    usuarioId: string,
    d: DatosDelPortero,
  ): Promise<Resultado<void, RechazoDePortero>> {
    if ((await this.perfiles.perfilDe(copropiedadId, usuarioId)) === null) {
      return fallo({ motivo: 'NO_ENCONTRADO' });
    }
    const documento = d.documento === undefined ? undefined : documentoDePortero(d.documento);
    if (documento === null) {
      return fallo({
        motivo: 'FORMATO',
        detalle: 'El documento admite de 3 a 20 letras, números o guiones',
      });
    }
    await this.cuentas.actualizarDatos(
      copropiedadId,
      usuarioId,
      { nombre: d.nombre, telefono: d.telefono },
      ctx.usuarioId,
    );
    await this.perfiles.guardar(
      {
        usuarioId,
        copropiedadId,
        porteria: d.porteria,
        sectores: d.sectores,
        correoContacto: d.correoContacto,
        ...(documento === undefined ? {} : { documento }),
      },
      ctx.usuarioId,
    );
    await this.anotar('edicion_de_portero', ctx, copropiedadId, usuarioId);
    return exito(undefined);
  }

  /**
   * H2 (15-L) · la baja: la cuenta y su rol quedan inactivos —sin borrar la
   * fila (RN-19)—, sus sesiones abiertas se cierran con motivo `baja` y su
   * número NO vuelve al pool: los eventos que se le atribuyen siguen señalando
   * a la misma persona. Libera una plaza del cupo.
   */
  async desactivar(
    ctx: ContextoTenant,
    copropiedadId: string,
    usuarioId: string,
    motivo: string,
  ): Promise<Resultado<void, RechazoDePortero>> {
    const limpio = motivo.normalize('NFC').trim();
    if (limpio.length < 3 || limpio.length > 300) {
      return fallo({
        motivo: 'FORMATO',
        detalle: 'El motivo de la baja lleva de 3 a 300 caracteres',
      });
    }
    const ahora = this.reloj.ahora();
    if (
      (await this.perfiles.perfilDe(copropiedadId, usuarioId)) === null ||
      !(await this.cuentas.darDeBaja(
        copropiedadId,
        usuarioId,
        { motivo: limpio, en: ahora },
        ctx.usuarioId,
      ))
    ) {
      return fallo({ motivo: 'NO_ENCONTRADO' });
    }
    for (const s of await this.sesiones.abiertas(copropiedadId, usuarioId)) {
      await this.cierre.cerrar(s, 'baja', ctx.usuarioId);
    }
    await this.bitacora.anotar({
      tipo: 'baja_de_portero',
      copropiedadId,
      ocurridoEn: ahora,
      usuarioId,
      actorId: ctx.usuarioId,
      detalle: limpio,
    });
    return exito(undefined);
  }

  /** Los porteros de la copropiedad, con quién está de turno y con sesión ahora. */
  async listar(copropiedadId: string): Promise<readonly FichaDelPortero[]> {
    const ahora = this.reloj.ahora();
    const perfiles = await this.perfiles.perfiles(copropiedadId);
    const [cuentas, vigentes, abiertas] = await Promise.all([
      this.cuentas.resumenes(
        copropiedadId,
        perfiles.map((p) => p.usuarioId),
      ),
      this.turnos.entre(copropiedadId, ahora, new Date(ahora.getTime() + 1)),
      this.sesiones.abiertas(copropiedadId),
    ]);
    return perfiles.flatMap((perfil) => {
      const cuenta = cuentas.find((c) => c.usuarioId === perfil.usuarioId);
      if (cuenta === undefined) return [];
      return [
        {
          cuenta,
          perfil,
          turnoVigente: vigentes.find((t) => t.porteroId === perfil.usuarioId) ?? null,
          sesionAbierta: abiertas.find((s) => s.porteroId === perfil.usuarioId) ?? null,
        },
      ];
    });
  }

  /** El perfil del propio portero. Sólo lectura: no hay ruta que lo edite por él. */
  async miPerfil(ctx: ContextoTenant): Promise<FichaDelPortero | null> {
    if (ctx.copropiedadId === null) return null;
    const perfil = await this.perfiles.perfilDe(ctx.copropiedadId, ctx.usuarioId);
    const [cuenta] = await this.cuentas.resumenes(ctx.copropiedadId, [ctx.usuarioId]);
    if (perfil === null || cuenta === undefined) return null;
    const ahora = this.reloj.ahora();
    return {
      cuenta,
      perfil,
      turnoVigente: await this.turnos.vigenteDe(ctx.copropiedadId, ctx.usuarioId, ahora),
      sesionAbierta: null,
    };
  }

  private async anotar(
    tipo: 'alta_de_portero' | 'edicion_de_portero',
    ctx: ContextoTenant,
    copropiedadId: string,
    usuarioId: string,
  ): Promise<void> {
    await this.bitacora.anotar({
      tipo,
      copropiedadId,
      ocurridoEn: this.reloj.ahora(),
      usuarioId,
      actorId: ctx.usuarioId,
    });
  }
}
