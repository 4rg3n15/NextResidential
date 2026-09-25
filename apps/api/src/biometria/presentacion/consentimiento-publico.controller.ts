import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BITACORA, esFallo } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { Publico } from '../../comun/decoradores';
import { REGISTRO_AUDITORIA } from '../../comun/auditoria';
import type { RegistroDeAuditoria } from '../../comun/auditoria';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { ContextoTenant } from '../../autenticacion';
import { ResponderConsentimiento, RevocarConsentimiento } from '../aplicacion/casos-de-uso';
import { ResolverEnlaceDeConsentimiento } from '../aplicacion/enlace-de-consentimiento';
import { PropagarConsentimientoAceptado } from '../aplicacion/sincronizacion-total';
import { RespuestaDelTitularDto } from './dtos';
import { paginaDeConsentimiento, paginaDeEnlaceInvalido } from './pagina-de-consentimiento';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA PUERTA DEL TITULAR · A3, ETAPA 15-E · RN-10
 *
 * Tres rutas públicas —las únicas de biometría sin sesión— y todas cuelgan de
 * un token firmado: sin él no hay nada que ver ni que responder. `@Publico()`
 * exime del guard; lo que sustituye al token de usuario es la firma del
 * enlace, verificada en cada petición y con caducidad.
 *
 * Quién escribe: la identidad de SERVICIO de la copropiedad que el enlace
 * nombra. No hay usuario porque el visitante no lo es; `quienResponde` es el
 * titular que el enlace lleva firmado, y el agregado lo comprueba igual que
 * con la ruta autenticada.
 *
 * Fuera del contrato OpenAPI a propósito: no es una API para clientes, es una
 * página para una persona. Los clientes generados (TS, Dart) no la necesitan.
 *
 * Por qué redirección tras el POST (303): que recargar la página no vuelva a
 * responder. Es el patrón POST-redirect-GET, y `formAction 'self'` de la CSP
 * lo admite porque todo ocurre en este mismo origen.
 */
const contextoDeServicio = (copropiedadId: string): ContextoTenant => ({
  usuarioId: ACTOR_INGESTA,
  rol: 'servicio',
  copropiedadId,
  copropiedadesAtendidas: [copropiedadId],
  mfaVerificado: true,
});

const RUTA = '/consentimiento';

@ApiExcludeController()
@Controller('consentimiento')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class ConsentimientoPublicoController {
  constructor(
    private readonly resolver: ResolverEnlaceDeConsentimiento,
    private readonly responder: ResponderConsentimiento,
    private readonly revocar: RevocarConsentimiento,
    private readonly propagar: PropagarConsentimientoAceptado,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(REGISTRO_AUDITORIA) private readonly auditoria: RegistroDeAuditoria,
  ) {}

  /** Desde dónde respondió el titular: la IP y el agente, para la evidencia (Ley 1581). */
  private static origenDe(peticion: Request): { ip: string | null; userAgent: string | null } {
    const agente = peticion.headers['user-agent'];
    return {
      ip: peticion.ip ?? null,
      userAgent: typeof agente === 'string' ? agente : null,
    };
  }

  // `@Publico()` va en CADA ruta y no en la clase: así cada exención se lee
  // una a una en el diff y en la suite de aislamiento.
  @Publico()
  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async ver(
    @Param('token') token: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<string> {
    const enlace = await this.resolver.ejecutar(token);
    if (enlace === null) {
      // 404 con la PÁGINA, no con el JSON del filtro global: quien lo lee es
      // una persona en un teléfono. Y no dice por qué: firma, caducidad o
      // consentimiento ausente se ven igual desde fuera.
      respuesta.status(404);
      return paginaDeEnlaceInvalido();
    }
    return paginaDeConsentimiento(enlace.consentimiento, `${RUTA}/${token}`, null, enlace.gastado);
  }

  @Publico()
  @Post(':token/respuesta')
  @HttpCode(303)
  @Redirect(RUTA, 303)
  async responderComoTitular(
    @Param('token') token: string,
    @Body() cuerpo: RespuestaDelTitularDto,
    @Req() peticion: Request,
  ): Promise<{ url: string }> {
    const enlace = await this.resolver.ejecutar(token);
    // Enlace inválido (404 en el GET) o ya USADO (el GET muestra el estado, sin
    // formularios): no se responde nada, se vuelve a la página.
    if (enlace === null || enlace.gastado) return { url: `${RUTA}/${token}` };

    const ctx = contextoDeServicio(enlace.datos.copropiedadId);
    const r = await this.responder.ejecutar(ctx, {
      consentimientoId: enlace.datos.consentimientoId,
      // El titular sale del ENLACE firmado, nunca del cuerpo (RN-10).
      quienResponde: enlace.datos.titularId,
      acepta: cuerpo.acepta === 'si',
    });
    if (esFallo(r)) {
      // Ya respondido, o cerrado: la página lo muestra tal cual está.
      this.bitacora.registrar('aviso', 'respuesta del titular no aplicada', {
        consentimientoId: enlace.datos.consentimientoId,
        motivo: r.error.detalle,
      });
      return { url: `${RUTA}/${token}` };
    }

    this.bitacora.registrar('info', 'el titular respondió por su enlace', {
      copropiedadId: enlace.datos.copropiedadId,
      consentimientoId: enlace.datos.consentimientoId,
      estado: r.valor.estado,
    });
    // La evidencia: qué respondió, a qué versión de la política, desde dónde
    // y cuándo, en la tabla append-only. El agregado guarda el instante.
    await this.auditoria.registrarRespuestaDeTitular({
      copropiedadId: enlace.datos.copropiedadId,
      consentimientoId: enlace.datos.consentimientoId,
      respuesta: r.valor.estado === 'vigente' ? 'aceptado' : 'rechazado',
      versionPolitica: enlace.consentimiento.versionPolitica,
      ...ConsentimientoPublicoController.origenDe(peticion),
    });
    if (r.valor.estado === 'vigente') {
      // Aceptado: hacia todas las terminales. Lo que no llegue queda en
      // bitácora y se relanza desde la consola; al titular no se le hace
      // esperar por un equipo apagado.
      await this.propagar.ejecutar(ctx, { consentimientoId: enlace.datos.consentimientoId });
    }
    return { url: `${RUTA}/${token}` };
  }

  @Publico()
  @Post(':token/revocacion')
  @HttpCode(303)
  @Redirect(RUTA, 303)
  async revocarComoTitular(
    @Param('token') token: string,
    @Req() peticion: Request,
  ): Promise<{ url: string }> {
    const enlace = await this.resolver.ejecutar(token);
    if (enlace === null || enlace.gastado) return { url: `${RUTA}/${token}` };

    const r = await this.revocar.ejecutar(contextoDeServicio(enlace.datos.copropiedadId), {
      consentimientoId: enlace.datos.consentimientoId,
      quienRevoca: enlace.datos.titularId,
    });
    this.bitacora.registrar(esFallo(r) ? 'aviso' : 'info', 'revocación por el enlace del titular', {
      copropiedadId: enlace.datos.copropiedadId,
      consentimientoId: enlace.datos.consentimientoId,
      ...(esFallo(r) ? { motivo: r.error.detalle } : r.valor),
    });
    if (!esFallo(r)) {
      await this.auditoria.registrarRespuestaDeTitular({
        copropiedadId: enlace.datos.copropiedadId,
        consentimientoId: enlace.datos.consentimientoId,
        respuesta: 'revocado',
        versionPolitica: enlace.consentimiento.versionPolitica,
        ...ConsentimientoPublicoController.origenDe(peticion),
      });
    }
    return { url: `${RUTA}/${token}` };
  }
}
