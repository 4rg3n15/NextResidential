import { exito, fallo } from '@ncr/domain-core';
import type { Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { BitacoraDeIdentidad } from '../../comun/bitacora-de-identidad';
import type { CrearCuentaPorUsuario, DirectorioDeCuentas, ResumenDeCuenta } from '../../cuentas';
import type { SesionDePorteria } from '../dominio/sesion-de-porteria';
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
}

export interface AltaDelPortero extends DatosDelPortero {
  readonly usuario: string;
  readonly contrasenaInicial: string;
}

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
  | { readonly motivo: 'NO_ENCONTRADO' };

/**
 * PORTEROS · alta y datos por el superadministrador, perfil de solo lectura
 * para el propio portero (E-02). El usuario lo elige quien da de alta; la
 * contraseña inicial también, y la cuenta nace obligada a cambiarla.
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
  ) {}

  async alta(
    ctx: ContextoTenant,
    copropiedadId: string,
    a: AltaDelPortero,
  ): Promise<Resultado<{ readonly usuarioId: string }, RechazoDePortero>> {
    const creada = await this.crearCuenta.ejecutar(
      {
        copropiedadId,
        usuario: a.usuario,
        nombre: a.nombre,
        telefono: a.telefono,
        rol: 'portero',
        contrasenaInicial: a.contrasenaInicial,
      },
      ctx.usuarioId,
    );
    if (!creada.ok) return creada;
    const usuarioId = creada.valor.usuarioId;
    await this.perfiles.guardar(
      {
        usuarioId,
        copropiedadId,
        porteria: a.porteria,
        sectores: a.sectores,
        correoContacto: a.correoContacto,
      },
      ctx.usuarioId,
    );
    await this.anotar('alta_de_portero', ctx, copropiedadId, usuarioId);
    return exito({ usuarioId });
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
      },
      ctx.usuarioId,
    );
    await this.anotar('edicion_de_portero', ctx, copropiedadId, usuarioId);
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
