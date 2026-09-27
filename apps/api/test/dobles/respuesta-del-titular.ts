import { esFallo, errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../src/autenticacion';
import type {
  RepositorioConsentimientos,
  RepositorioPlantillas,
} from '../../src/biometria/aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL TITULAR RESPONDE · DOBLE DE PRUEBA, NO CAMINO DE PRODUCCIÓN
 *
 * Decisión final del cliente (corrección de la 15-L, ADR-032): la ÚNICA
 * constancia es la casilla de quien registra. El enlace del visitante (F-e) y
 * la confirmación presencial (D-10) se retiraron de la interfaz, y con ellos el
 * caso de uso que llevaba un consentimiento «solicitado» a «otorgado por el
 * titular». El DOMINIO conserva ese origen —`otorgar`, RN-10— y las suites que
 * prueban lo que viene después (sincronizar, suprimir, el disparador de la
 * 0013) necesitan llegar a ese estado: este doble lo hace con el agregado, sin
 * atajos, exactamente como lo hacía el caso de uso retirado.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class RespuestaDelTitular {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly plantillas: RepositorioPlantillas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: {
      readonly consentimientoId: string;
      readonly quienResponde: string;
      readonly acepta: boolean;
    },
  ): Promise<Resultado<{ readonly estado: string }, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La copropiedad no existe'));
    }
    const actual = await this.consentimientos.porId(copropiedadId, entrada.consentimientoId);
    if (actual === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'El consentimiento no existe'));
    }
    const ahora = this.reloj.ahora();
    const respondido = entrada.acepta
      ? actual.otorgar(entrada.quienResponde, ahora)
      : actual.rechazar(entrada.quienResponde, ahora);
    if (esFallo(respondido)) return respondido;
    await this.consentimientos.guardar(respondido.valor, ctx.usuarioId);
    if (entrada.acepta) {
      for (const p of await this.plantillas.deConsentimiento(copropiedadId, actual.id)) {
        const habilitada = p.habilitarSincronizacion(respondido.valor);
        if (esFallo(habilitada)) continue;
        await this.plantillas.guardar(habilitada.valor, ctx.usuarioId);
      }
    }
    return exito({ estado: respondido.valor.estado });
  }
}
