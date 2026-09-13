import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import type { RegistroDeAuditoria } from '../comun/auditoria';
import { REGISTRO_AUDITORIA as TOKEN_AUDITORIA } from '../comun/auditoria';
import type { ContextoTenant } from '../autenticacion';
import { alcanzaCopropiedad } from '../autenticacion';

export type { RegistroDeAuditoria } from '../comun/auditoria';
export { REGISTRO_AUDITORIA } from '../comun/auditoria';

/**
 * Barrera de aislamiento en la CAPA DE APLICACIÓN.
 *
 * La RLS ya aísla por fila, pero la llave secreta la omite (`BYPASSRLS`), y la
 * usan el Edge, los workers y la ingesta. Sin esta comprobación, esas rutas
 * quedarían sin ninguna barrera: es el riesgo número uno del proyecto (§2.7.6).
 * Por eso el chequeo es explícito y no una consecuencia de la base.
 *
 * Devuelve 404 y no 403 cuando el recurso pertenece a otra copropiedad: un 403
 * confirma que el identificador EXISTE, y esa confirmación ya es una fuga —
 * permite enumerar viviendas o autorizaciones ajenas contando respuestas.
 */
@Injectable()
export class Aislamiento {
  constructor(
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(TOKEN_AUDITORIA) private readonly auditoria: RegistroDeAuditoria,
  ) {}

  /**
   * Comprueba el alcance y **devuelve el contexto de la copropiedad DESTINO**.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POR QUÉ DEVUELVE UN CONTEXTO Y NO `void` — D-71
   *
   * El defecto: **ningún superadministrador podía escribir nada**. Las lecturas
   * se arreglaron en la 09-B poniendo la copropiedad en la ruta, pero los casos
   * de uso de escritura seguían leyéndola del token (`ctx.copropiedadId`), y en
   * el superadministrador ese campo es **nulo por diseño** —su alcance lo
   * resuelve `app.es_superadmin()`—. Resultado: `400 · La identidad no tiene
   * copropiedad` en vivienda, residente, vehículo, carga de padrón,
   * autorización, lista negra y biometría. Todas.
   *
   * No se vio antes porque **todas las pruebas de escritura usaban
   * administrador**, que sí lleva `copropiedad_id` en el token. Es el mismo
   * hueco que dejó las ocho pantallas en «sin permiso»: el rol que no encaja en
   * el modelo mental de «una identidad, una copropiedad» es justo el que nadie
   * prueba.
   *
   * La salida no es un `if` más en cada caso de uso: es que **el contexto que
   * llega al dominio ya lleve la copropiedad de destino resuelta y validada**.
   * Así `ctx.copropiedadId` dentro de un caso de uso significa siempre lo mismo
   * —«la copropiedad sobre la que se está operando»— y no «la del token, si la
   * hay». Un caso de uso no puede olvidarse de la comprobación porque no la
   * hace: recibe el dato ya comprobado o no se ejecuta.
   *
   * El destino sale de la RUTA, que es lo que el selector de la consola pone.
   * Una copropiedad ajena —o un selector manipulado— no llega aquí: se queda en
   * el 404 de abajo, con su registro en `auditoria_seguridad`.
   */
  async exigirAlcance(
    ctx: ContextoTenant,
    copropiedadId: string,
    recurso: string,
  ): Promise<ContextoTenant> {
    if (alcanzaCopropiedad(ctx, copropiedadId)) {
      // El contexto de DESTINO: mismo actor y mismo rol, con la copropiedad ya
      // resuelta. Se devuelve uno nuevo en vez de mutar el del token para que
      // no haya forma de que un caso de uso vea un contexto a medio validar.
      return { ...ctx, copropiedadId };
    }

    this.bitacora.registrar('aviso', 'acceso cruzado bloqueado', {
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadSolicitada: copropiedadId,
      recurso,
    });
    await this.auditoria.registrarAccesoCruzado({
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadSolicitada: copropiedadId,
      recurso,
    });
    throw new NotFoundException('Recurso no encontrado');
  }

  /** Para rutas de servicio: la copropiedad llega en el cuerpo, no en el token. */
  async exigirAlcanceDeServicio(
    ctx: ContextoTenant,
    copropiedadId: string,
    recurso: string,
  ): Promise<ContextoTenant> {
    if (ctx.rol !== 'servicio') return this.exigirAlcance(ctx, copropiedadId, recurso);
    if (ctx.copropiedadId === copropiedadId) return { ...ctx, copropiedadId };
    await this.auditoria.registrarAccesoCruzado({
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadSolicitada: copropiedadId,
      recurso,
    });
    throw new ForbiddenException('Copropiedad fuera del alcance de la identidad de servicio');
  }
}
