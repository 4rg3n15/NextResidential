import { errorDominio, esFallo, exito, fallo, identidadCoincide } from '@ncr/domain-core';
import type {
  Bitacora,
  ConsentimientoBiometrico,
  ErrorDominio,
  IdentidadEscrita,
  Reloj,
  Resultado,
} from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RegistroDeAuditoria } from '../../comun/auditoria';
import type { IdentidadDePersona } from '../../padron';
import type { RepositorioConsentimientos } from './puertos';
import type { ResponderConsentimiento } from './casos-de-uso';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-10 · EL TITULAR ACEPTA EN LA PORTERÍA, CON SU PROPIA MANO
 *
 * En sitio, el 26/09/2026, el visitante no pudo abrir el enlace (H-SITIO-10:
 * la URL apuntaba a 127.0.0.1) y la biometría se quedó sin forma de avanzar.
 * El canal presencial es la alternativa, y la condición es la misma de RN-10:
 * **responde el titular, nadie por él.**
 *
 * Cómo se sostiene eso sin enlace:
 *  1. El TITULAR escribe su nombre y su documento en la pantalla. La consola
 *     no los trae precargados —no los recibe nunca de la API—, así que para
 *     «marcarlo por él» el operador tendría que teclear la identidad de otro,
 *     y eso queda a su nombre en la auditoría.
 *  2. El servidor los compara con la persona del padrón a la que pertenece el
 *     consentimiento (`identidadCoincide`, pura). No coincide → no se acepta,
 *     y el mensaje no revela cuál de los dos falló ni qué dice el registro.
 *  3. Acepta la versión de la política QUE SE LE MOSTRÓ; si no es la del
 *     consentimiento, no se acepta: aceptó otro texto.
 *  4. La aceptación pasa por el MISMO agregado, con `quienAcepta` = titular.
 *  5. Auditoría append-only: canal `presencial`, operador que atendía la
 *     pantalla, instante y versión de la política.
 *
 * Lo que NO resuelve —y el ADR lo dice—: que un operador teclee la identidad
 * del visitante por él. Ninguna técnica lo impide del todo; la auditoría lo
 * atribuye. Su validez frente a la Ley 1581 la decide el asesor jurídico de
 * Grupo Control, no este código (PENDIENTE DE DEFINICIÓN).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface AceptacionPresencial {
  readonly consentimientoId: string;
  /** Lo que escribió el titular. Nunca lo que dice el registro. */
  readonly identidad: IdentidadEscrita;
  /** La versión de la política que se le mostró y aceptó. */
  readonly versionPoliticaAceptada: string;
  readonly origen: { readonly ip: string | null; readonly userAgent: string | null };
}

const NO_COINCIDE =
  'El nombre o el documento escritos no coinciden con los del titular registrado. ' +
  'Debe escribirlos el propio titular, tal como figuran en su documento.';

export class AceptarConsentimientoPresencial {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly identidades: IdentidadDePersona,
    private readonly responder: ResponderConsentimiento,
    private readonly auditoria: RegistroDeAuditoria,
    private readonly bitacora: Bitacora,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: AceptacionPresencial,
  ): Promise<Resultado<{ readonly estado: string }, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La copropiedad no existe', 'RN-15'));
    }
    const c = await this.consentimientos.porId(copropiedadId, entrada.consentimientoId);
    if (c === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'El consentimiento no existe', 'RN-15'));
    }
    // F4 (15-L) · la confirmación OPCIONAL de una casilla ya declarada (D-10
    // como opción, nunca como paso): el titular, presente, la hace suya.
    const confirmacion = c.estado === 'vigente' && c.origen === 'declarado_por_quien_registra';
    if (c.estado !== 'pendiente' && !confirmacion) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          `Un consentimiento ${c.estado} no se acepta en la portería: sólo uno pendiente`,
          'RN-10',
        ),
      );
    }
    if (entrada.versionPoliticaAceptada !== c.versionPolitica) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          `La política aceptada (${entrada.versionPoliticaAceptada}) no es la del ` +
            `consentimiento (${c.versionPolitica}): muéstrele la vigente y vuelva a empezar`,
          'RN-10',
        ),
      );
    }

    const registrada = await this.identidades.porId(copropiedadId, c.titularId);
    if (registrada === null || !identidadCoincide(entrada.identidad, registrada)) {
      // Sin los datos: ni lo escrito ni lo registrado van a la bitácora.
      this.bitacora.registrar('aviso', 'consentimiento presencial: la identidad no coincide', {
        copropiedadId,
        consentimientoId: c.id,
        operadorId: ctx.usuarioId,
      });
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', NO_COINCIDE, 'RN-10'));
    }

    // Quien acepta es el TITULAR; el operador queda como actor de la escritura,
    // no como quien consiente.
    const r = confirmacion
      ? await this.confirmar(ctx, c)
      : await this.responder.ejecutar(ctx, {
          consentimientoId: c.id,
          quienResponde: c.titularId,
          acepta: true,
        });
    if (esFallo(r)) return r;

    await this.auditoria.registrarRespuestaDeTitular({
      copropiedadId,
      consentimientoId: c.id,
      respuesta: 'aceptado',
      versionPolitica: c.versionPolitica,
      ip: entrada.origen.ip,
      userAgent: entrada.origen.userAgent,
      canal: 'presencial',
      operadorId: ctx.usuarioId,
    });
    this.bitacora.registrar('info', 'consentimiento aceptado en la portería por su titular', {
      copropiedadId,
      consentimientoId: c.id,
      operadorId: ctx.usuarioId,
      versionPolitica: c.versionPolitica,
    });
    return exito({ estado: r.valor.estado });
  }

  private async confirmar(
    ctx: ContextoTenant,
    c: ConsentimientoBiometrico,
  ): Promise<Resultado<{ readonly estado: string }, ErrorDominio>> {
    const confirmado = c.confirmarPorElTitular(c.titularId, this.reloj.ahora());
    if (esFallo(confirmado)) return confirmado;
    await this.consentimientos.guardar(confirmado.valor, ctx.usuarioId);
    return exito({ estado: confirmado.valor.estado });
  }
}
