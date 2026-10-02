import type { ContextoTenant } from '../../autenticacion';
import { CLAVE_EN_EL_EDGE } from '../../comun/credenciales-en-el-edge';
import type { CredencialesEnElEdge } from '../../comun/credenciales-en-el-edge';
import type {
  AltaDeEquipo,
  DatosDeEquipo,
  RepositorioDeEquipos,
  ResultadoDeSondeo,
} from '../aplicacion/puertos';
import type {
  EquipoConSecreto,
  SecretosDeAlarmServer,
} from '../aplicacion/secretos-de-alarm-server';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · D2 · CON PUENTE, LA CREDENCIAL NO SE QUEDA EN LA NUBE
 *
 * El mismo puerto `RepositorioDeEquipos`, envuelto: en una copropiedad SIN
 * puente, todo pasa tal cual al repositorio de siempre (R1). Con puente:
 *
 *  · alta y edición se guardan SIN el secreto, y el secreto viaja al Edge por
 *    el túnel (`CredencialesEnElEdge.entregar`). En la base queda `edge:<gw>`
 *    y una huella no reversible. Sin túnel, falla ANTES de escribir nada
 *    (C3); si la entrega falla DESPUÉS, el alta se deshace: un equipo sin
 *    credencial en ningún lado no se queda a medias. Una edición que falla
 *    así se reintenta tal cual (es idempotente).
 *  · editar sin secreto también avisa al Edge (host, puerto, usuario pueden
 *    cambiar): conserva la clave que tiene.
 *  · `credencialPara` de un equipo así devuelve `edge:<equipo>`: no es la clave,
 *    es la instrucción de pedírsela al Edge (sonda y corrector por el túnel).
 *  · la baja le dice al Edge que la borre.
 *
 * El resto de métodos delega: implementa un puerto de once, como el adaptador
 * de PostgreSQL que envuelve (la excepción de §2.3 de los adaptadores de puerto).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const REVERTIDA = 'Alta revertida: la credencial no llegó al Edge del conjunto';

export class RepositorioConCredencialEnElEdge implements RepositorioDeEquipos {
  constructor(
    private readonly base: RepositorioDeEquipos,
    private readonly edge: CredencialesEnElEdge,
  ) {}

  listar(ctx: ContextoTenant, copropiedadId: string) {
    return this.base.listar(ctx, copropiedadId);
  }
  activosQueEmiten() {
    return this.base.activosQueEmiten();
  }
  activos() {
    return this.base.activos();
  }
  copropiedadDeActivo(dispositivoId: string) {
    return this.base.copropiedadDeActivo(dispositivoId);
  }
  reactivar(ctx: ContextoTenant, copropiedadId: string, equipoId: string) {
    return this.base.reactivar(ctx, copropiedadId, equipoId);
  }
  auditarCorreccion(ctx: ContextoTenant, copropiedadId: string, detalle: string) {
    return this.base.auditarCorreccion(ctx, copropiedadId, detalle);
  }
  registrarSondeo(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    veredicto: ResultadoDeSondeo,
  ) {
    return this.base.registrarSondeo(ctx, copropiedadId, equipoId, veredicto);
  }

  async crear(
    ctx: ContextoTenant,
    copropiedadId: string,
    alta: AltaDeEquipo,
    veredicto: ResultadoDeSondeo,
  ): Promise<DatosDeEquipo> {
    if ((await this.edge.puenteDe(copropiedadId)) === null) {
      return this.base.crear(ctx, copropiedadId, alta, veredicto);
    }
    this.edge.exigirTunel(copropiedadId);
    const { secreto, ...sinSecreto } = alta;
    const equipo = await this.base.crear(ctx, copropiedadId, sinSecreto, veredicto);
    try {
      await this.edge.entregar(ctx, copropiedadId, equipo.id, secreto ?? null);
    } catch (error) {
      // El túnel se cayó a mitad, o el Edge no contestó: sin credencial en ningún
      // lado el equipo no sirve. Se deshace con una baja lógica (RN-19), que deja
      // libre su dirección: reintentar no duplica nada.
      await this.base.desactivar(ctx, copropiedadId, equipo.id, REVERTIDA).catch(() => null);
      throw error;
    }
    return equipo;
  }

  async editar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    alta: AltaDeEquipo,
    veredicto: ResultadoDeSondeo,
  ): Promise<DatosDeEquipo | null> {
    if ((await this.edge.puenteDe(copropiedadId)) === null) {
      return this.base.editar(ctx, copropiedadId, equipoId, alta, veredicto);
    }
    this.edge.exigirTunel(copropiedadId);
    const { secreto, ...sinSecreto } = alta;
    const equipo = await this.base.editar(ctx, copropiedadId, equipoId, sinSecreto, veredicto);
    if (equipo !== null) {
      await this.edge.entregar(ctx, copropiedadId, equipoId, secreto ?? null);
    }
    return equipo;
  }

  async desactivar(ctx: ContextoTenant, copropiedadId: string, equipoId: string, motivo: string) {
    const equipo = await this.base.desactivar(ctx, copropiedadId, equipoId, motivo);
    if (equipo !== null && (await this.edge.puenteDe(copropiedadId)) !== null) {
      await this.edge.retirar(copropiedadId, equipoId);
    }
    return equipo;
  }

  async credencialPara(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<string | null> {
    const enLaNube = await this.base.credencialPara(ctx, copropiedadId, equipoId);
    if (enLaNube !== null || (await this.edge.puenteDe(copropiedadId)) === null) return enLaNube;
    return CLAVE_EN_EL_EDGE(equipoId);
  }
}

/**
 * 15-Q2 · D2 · el secreto del Alarm Server de una cámara se emite DESPUÉS del
 * alta; con puente, la cámara publica al Edge, así que el Edge tiene que
 * recibirlo: se le vuelve a entregar el equipo (sin clave: conserva la suya).
 */
export class SecretosConEdge implements SecretosDeAlarmServer {
  constructor(
    private readonly base: SecretosDeAlarmServer,
    private readonly edge: CredencialesEnElEdge,
  ) {}

  async emitir(ctx: ContextoTenant, copropiedadId: string, equipo: EquipoConSecreto) {
    const secreto = await this.base.emitir(ctx, copropiedadId, equipo);
    if ((await this.edge.puenteDe(copropiedadId)) !== null) {
      await this.edge.entregar(ctx, copropiedadId, equipo.id, null);
    }
    return secreto;
  }
  secretoDe(ctx: ContextoTenant, copropiedadId: string, equipoId: string) {
    return this.base.secretoDe(ctx, copropiedadId, equipoId);
  }
  equipoPorSecreto(secreto: string) {
    return this.base.equipoPorSecreto(secreto);
  }
}
