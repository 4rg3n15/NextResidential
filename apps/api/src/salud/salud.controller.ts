import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import { Publico } from '../comun/decoradores';
import { ProveedorDeJwks, describirEstadoDeJwks } from '../autenticacion';
import type { Configuracion } from '../configuracion/esquema';
import { SONDA_POSTGRES } from '../arranque/sonda-postgres';
import type { ResultadoDeLaBase, SondaDePostgres } from '../arranque/sonda-postgres';
import { PLANIFICADOR } from '../planificacion';
import type { Planificador } from '../planificacion';
import { TUNELES_DE_EDGE } from '../proveedores';
import type { TunelesDeEdge } from '../proveedores';
import { ListoDto, SaludDto } from './respuestas';

/**
 * 15-O · un corte ya repuesto, o un error del planificador, se sigue avisando
 * en `/ready` durante este tiempo: quien mira después de un parpadeo ve qué pasó.
 */
export const VENTANA_DE_AVISO_MS = 5 * 60_000;

/**
 * `/health` y `/ready` son cosas distintas y por eso son dos rutas.
 *
 * `/health`: el proceso vive. Si falla, hay que reiniciarlo.
 * `/ready`: puede atender tráfico. Si falla, hay que sacarlo del balanceador
 *  pero NO reiniciarlo — la dependencia que le falta volverá.
 *
 * Confundirlas provoca reinicios en cadena cuando una dependencia externa
 * parpadea. En la ETAPA 03 `/ready` incorpora el JWKS: sin él, la API no puede
 * verificar tokens y debe declararse no lista, no muerta.
 */
@ApiTags('salud')
@Controller()
export class SaludController {
  constructor(
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
    @Inject(ProveedorDeJwks) private readonly jwks: ProveedorDeJwks,
    @Inject(SONDA_POSTGRES) private readonly postgres: SondaDePostgres,
    @Inject(PLANIFICADOR) private readonly planificador: Planificador,
    // 15-Q2 · A3 · cuántos Edge tienen el túnel abierto (opcional: hay bancos sin él).
    @Optional() @Inject(TUNELES_DE_EDGE) private readonly tuneles?: TunelesDeEdge,
  ) {}

  @Publico()
  @Get('health')
  @ApiOperation({ summary: 'El proceso está vivo' })
  @ApiOkResponse({ type: SaludDto })
  salud(): SaludDto {
    return { estado: 'vivo', momento: this.reloj.ahora().toISOString() };
  }

  @Publico()
  @Get('ready')
  @ApiOperation({ summary: 'La aplicación puede atender tráfico' })
  @ApiOkResponse({ type: ListoDto })
  @ApiServiceUnavailableResponse({
    type: ListoDto,
    description:
      'Falta una dependencia. El proceso está sano: sacar del balanceador, no reiniciar.',
  })
  async listo(): Promise<ListoDto> {
    // La configuración ya está validada si el proceso arrancó; se comprueba de
    // nuevo para que `/ready` no mienta si algo la dejó incompleta en caliente.
    const dependencias: Record<string, string> = {
      configuracion: this.config.origenesPermitidos.length > 0 ? 'ok' : 'incompleta',
      // Sin JWKS la API no puede verificar ningún token: no está lista para
      // atender tráfico, pero el proceso está sano. Por eso 503 y no una caída.
      //
      // El estado se publica con su NOMBRE —`inalcanzable`, `sin-claves`— y no
      // como un «no-disponible» genérico: quien mira esta respuesta a las tres
      // de la mañana necesita saber si arregla el entorno o el panel. El
      // detalle del error no viaja: `/ready` es pública.
      jwks: describirEstadoDeJwks(await this.jwks.sondear()),
      // Aquí había una cadena fija (`'no-conectado-etapa-04'`) y `/ready` respondía 200 sin
      // haber tocado la base: una sonda que no sonda, de la familia del JWKS.
      postgres: 'ok',
    };
    /**
     * 15-O · por el pool de la API, y con motivo. `agotado` (todas sus
     * conexiones ocupadas y peticiones esperando) no es lo mismo que
     * `no-disponible` (la base no contesta, o el pooler no admite más).
     */
    const base = await this.postgres.comprobar();
    const motivos: Record<string, string> = {};
    if (base.estado !== 'ok') {
      dependencias.postgres = base.clase ?? 'no-disponible';
      motivos.postgres =
        dependencias.postgres === 'agotado'
          ? `pool de la API agotado: ${base.detalle}`
          : `base de datos no disponible: ${base.detalle}`;
    }
    const avisos = this.avisos(base);
    const detalle = {
      dependencias,
      ...(Object.keys(motivos).length > 0 ? { motivos } : {}),
      ...(Object.keys(avisos).length > 0 ? { avisos } : {}),
    };
    if (Object.values(dependencias).some((estado) => estado !== 'ok')) {
      throw new ServiceUnavailableException({ estado: 'no-listo', ...detalle });
    }
    return { estado: 'listo', ...detalle };
  }

  /**
   * 15-O · lo que no saca la API del balanceador pero no puede callarse: el
   * planificador (pg-boss) que no está en marcha —sin él RN-11 no se cumple— y
   * un corte reciente de la base, ya repuesto.
   */
  private avisos(base: ResultadoDeLaBase): Record<string, string> {
    const avisos: Record<string, string> = {};
    if (this.tuneles !== undefined) avisos.edge = `${String(this.tuneles.conectados)} conectado(s)`;
    const ahora = this.reloj.ahora().getTime();
    const haceSegundos = (m: Date): number => Math.max(0, Math.round((ahora - m.getTime()) / 1000));
    const reciente = (m: Date): boolean => ahora - m.getTime() < VENTANA_DE_AVISO_MS;
    const plan = this.planificador.estado();
    if (plan.fase !== 'en-marcha') {
      avisos.planificador = plan.motivo === undefined ? plan.fase : `${plan.fase}: ${plan.motivo}`;
    } else if (plan.ultimoError !== undefined && reciente(plan.ultimoError.momento)) {
      avisos.planificador =
        `en marcha; último error hace ${String(haceSegundos(plan.ultimoError.momento))} s: ` +
        plan.ultimoError.categoria;
    }
    if (
      base.estado === 'ok' &&
      base.ultimoCorte !== undefined &&
      reciente(base.ultimoCorte.momento)
    ) {
      avisos.postgres =
        `${base.ultimoCorte.categoria} hace ${String(haceSegundos(base.ultimoCorte.momento))} s; ` +
        'el pool la descartó y ya responde';
    }
    return avisos;
  }
}
