import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Alerta, FiltroDeEventos, GENERADOR_DE_ID, RELOJ, esFallo } from '@ncr/domain-core';
import type { ErrorDominio, GeneradorDeId, Reloj, Resultado } from '@ncr/domain-core';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { ErrorApiDto } from '../../comun/respuestas';
import { ESCALAMIENTO_DE_ALERTA, REPOSITORIO_EVENTOS } from '../../eventos';
import type { RepositorioEventos } from '../../eventos';
import type { EscalamientoDeAlerta } from '../aplicacion/puertos';
import { AccionarPuertaAMano, BITACORA_DE_ORDENES } from '../aplicacion/apertura-manual';
import type { BitacoraDeOrdenes } from '../aplicacion/apertura-manual';
import { construirCola, resumenDeCola } from '../aplicacion/cola-de-atencion';
import { CANAL_DE_INTERCOM } from '../aplicacion/puertos';
import type { CanalDeIntercom } from '../aplicacion/puertos';
import {
  AceptadoDto,
  AvisoAlResidenteDto,
  ColaDeAtencionDto,
  EmergenciaDto,
  EstadoDeCanalDto,
  HistorialDeOrdenesDto,
  OrdenEjecutadaDto,
  OrdenManualDto,
  SolicitudDeCanalDto,
} from './dtos';

/**
 * Consolas operativas — portería (HU-21 a HU-24) y guardia virtual (CU-03,
 * HU-25 a HU-29).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO CUELGA DE `copropiedades/:id`, Y NO ES ESTÉTICA
 *
 * La suite de aislamiento **enumera el enrutador** y prueba cada ruta con el
 * identificador de otra copropiedad. Una ruta con la copropiedad en el camino
 * entra sola en ese barrido; una ruta que la tomara del token o del cuerpo
 * quedaría fuera sin que nadie lo notara. Es la diferencia entre una cobertura
 * que crece con el código y una lista que alguien tiene que acordarse de
 * actualizar.
 *
 * Un recurso de otra copropiedad responde **404 y no 403**: un 403 confirmaría
 * que el identificador existe.
 */
@ApiTags('guardia')
@ApiBearerAuth()
@Controller('copropiedades/:id/guardia')
export class GuardiaController {
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(AccionarPuertaAMano) private readonly accionar: AccionarPuertaAMano,
    @Inject(BITACORA_DE_ORDENES) private readonly ordenes: BitacoraDeOrdenes,
    @Inject(REPOSITORIO_EVENTOS) private readonly eventos: RepositorioEventos,
    @Inject(CANAL_DE_INTERCOM) private readonly intercom: CanalDeIntercom,
    @Inject(ESCALAMIENTO_DE_ALERTA) private readonly escalar: EscalamientoDeAlerta,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(GENERADOR_DE_ID) private readonly ids: GeneradorDeId,
  ) {}

  private desenvolver<T>(r: Resultado<T, ErrorDominio>): T {
    if (r.ok) return r.valor;
    // `OPERACION_NO_PERMITIDA` es 403 y el resto 400: un motivo que falta es un
    // error del cliente, no una falta de permiso, y confundirlos haría que la
    // consola mostrara «sin permiso» a quien sólo olvidó escribir por qué abre.
    if (r.error.codigo === 'OPERACION_NO_PERMITIDA') throw new ForbiddenException(r.error.detalle);
    throw new BadRequestException(r.error.detalle);
  }

  /* ── Portería ───────────────────────────────────────────────────────── */

  /**
   * HU-22 · CA-16 · CA-17 · RN-08 — apertura o negación **con motivo**.
   *
   * `201` y no `200`: la orden CREA un hecho auditado, no consulta uno. Y el
   * cuerpo devuelve la orden entera, incluido el motivo ya normalizado, para
   * que la consola muestre lo que quedó registrado y no lo que se tecleó.
   */
  @Post('ordenes')
  @Roles('portero', 'operador_central', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Abre o niega a mano, con motivo obligatorio (RN-08)' })
  @ApiCreatedResponse({ type: OrdenEjecutadaDto })
  @ApiForbiddenResponse({ type: ErrorApiDto, description: 'Rol que no acciona puertas' })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async ordenar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: OrdenManualDto,
  ): Promise<OrdenEjecutadaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/ordenes');
    const orden = this.desenvolver(
      await this.accionar.ejecutar(ctx, {
        copropiedadId,
        dispositivoId: dto.dispositivoId,
        accion: dto.accion,
        motivo: dto.motivo,
        eventoId: dto.eventoId ?? null,
      }),
    );
    return { ...orden, momento: orden.momento.toISOString() };
  }

  /** HU-23 · el historial inmediato de lo accionado a mano en esta portería. */
  @Get('ordenes')
  @Roles('portero', 'operador_central', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Últimas órdenes manuales de la copropiedad (HU-23)' })
  @ApiOkResponse({ type: HistorialDeOrdenesDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async historialDeOrdenes(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<HistorialDeOrdenesDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/ordenes');
    const ordenes = await this.ordenes.ultimas(copropiedadId, 20);
    return { ordenes: ordenes.map((o) => ({ ...o, momento: o.momento.toISOString() })) };
  }

  /* ── Guardia virtual ────────────────────────────────────────────────── */

  /**
   * HU-25 · CU-03 · la cola, ordenada por ESPERA y no por recencia.
   *
   * La espera se calcula aquí, en cada consulta. Guardarla la haría envejecer:
   * la consola pintaría un número que dejó de ser cierto en cuanto se guardó.
   */
  @Get('cola')
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Cola de atención con tiempo de espera (CU-03, HU-25)' })
  @ApiOkResponse({ type: ColaDeAtencionDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async cola(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<ColaDeAtencionDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/cola');
    /**
     * Se pide la ÚLTIMA hora, no «todo». La cola de atención es lo que está
     * pasando ahora: un rango abierto recorrería todas las particiones de
     * `eventos` para descartar casi todo, y en la pantalla que más se refresca.
     */
    const ahora = this.reloj.ahora();
    const filtro = FiltroDeEventos.crear({
      copropiedadId,
      desde: new Date(ahora.getTime() - 60 * 60 * 1000),
      hasta: ahora,
      tamanoPagina: 50,
    });
    if (esFallo(filtro)) throw new BadRequestException(filtro.error.detalle);
    const pagina = await this.eventos.consultar(filtro.valor);
    const cola = construirCola(pagina.filas, ahora);
    return {
      cola: cola.map((e) => ({
        eventoId: e.evento.id,
        ocurridoEn: new Date(e.evento.ocurridoEn).toISOString(),
        motivo: e.evento.motivo ?? null,
        resultado: e.evento.resultado,
        dispositivoId: e.evento.dispositivoId,
        viviendaId: e.evento.viviendaId,
        placaDetectada: e.evento.placaDetectada,
        esperaSegundos: e.esperaSegundos,
        urgencia: e.urgencia,
        demorado: e.demorado,
      })),
      ...resumenDeCola(cola),
    };
  }

  /**
   * HU-26 · el canal de audio, que es **exclusivo** (ADR-01).
   *
   * Devuelve `en_espera` con el puesto en la cola en vez de rechazar: el
   * operador necesita saber cuándo le toca, no reintentar a ciegas contra un
   * canal que no sabe cuándo se libera.
   */
  @Post('intercom/abrir')
  @HttpCode(200)
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Pide el canal de audio del equipo; encola si está ocupado (ADR-01)' })
  @ApiOkResponse({ type: EstadoDeCanalDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async abrirCanal(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: SolicitudDeCanalDto,
  ): Promise<EstadoDeCanalDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/intercom');
    return this.intercom.pedir(copropiedadId, dto.dispositivoId, ctx.usuarioId);
  }

  @Post('intercom/cerrar')
  @HttpCode(200)
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Suelta el canal y lo cede al primero de la cola' })
  @ApiOkResponse({ type: EstadoDeCanalDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async cerrarCanal(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: SolicitudDeCanalDto,
  ): Promise<EstadoDeCanalDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/intercom');
    return this.intercom.soltar(copropiedadId, dto.dispositivoId, ctx.usuarioId);
  }

  @Get('intercom/:dispositivoId')
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Estado del canal: quién tiene la palabra y cuántos esperan' })
  @ApiOkResponse({ type: EstadoDeCanalDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async estadoDelCanal(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('dispositivoId', ParseUUIDPipe) dispositivoId: string,
  ): Promise<EstadoDeCanalDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/intercom');
    return this.intercom.estado(copropiedadId, dispositivoId, ctx.usuarioId);
  }

  /**
   * HU-28 · CU-03 flujo alterno 1 — el residente no contesta al intercom, y el
   * operador le avisa por otra vía.
   *
   * Hoy el aviso se encola en el notificador; FCM llega con la ETAPA 11, que es
   * la dueña del registro de tokens del dispositivo. Lo que **sí** existe ya es
   * la constancia: que se intentó avisar, a qué vivienda y cuándo.
   */
  @Post('avisar-residente')
  @HttpCode(202)
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Avisa al residente cuando no contesta al intercom (HU-28)' })
  @ApiOkResponse({ type: AceptadoDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async avisarResidente(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: AvisoAlResidenteDto,
  ): Promise<AceptadoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/avisar');
    const alerta = Alerta.abrir({
      id: this.ids.nuevo(),
      copropiedadId,
      tipo: 'acceso_dudoso',
      severidad: 'informativa',
      generadaEn: this.reloj.ahora(),
      dispositivoId: dto.viviendaId,
      notas: `Aviso al residente: ${dto.texto}`,
    });
    if (esFallo(alerta)) throw new BadRequestException(alerta.error.detalle);
    await this.escalar.ejecutar(alerta.valor, ctx.usuarioId);
    return {
      aceptado: true,
      detalle: 'El aviso queda registrado; el envío por FCM llega en la ETAPA 11',
    };
  }

  /**
   * HU-29 · CU-03 flujo alterno 4 — **emergencia**.
   *
   * Severidad crítica y motivo obligatorio. No hay confirmación de dos pasos a
   * propósito: quien pulsa esto tiene una emergencia delante, y una ventana de
   * confirmación cuesta segundos que RN-18 no concede. La fricción está en el
   * motivo, que se escribe una vez y queda.
   */
  @Post('emergencia')
  @HttpCode(202)
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Alerta de emergencia, severidad crítica (HU-29, RN-18)' })
  @ApiOkResponse({ type: AceptadoDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async emergencia(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: EmergenciaDto,
  ): Promise<AceptadoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/emergencia');
    const alerta = Alerta.abrir({
      id: this.ids.nuevo(),
      copropiedadId,
      tipo: 'panico',
      severidad: 'critica',
      generadaEn: this.reloj.ahora(),
      dispositivoId: dto.dispositivoId ?? 'consola-guardia',
      notas: dto.motivo,
    });
    if (esFallo(alerta)) throw new BadRequestException(alerta.error.detalle);
    const escalada = await this.escalar.ejecutar(alerta.valor, ctx.usuarioId);
    return {
      aceptado: true,
      detalle: `Escalada a ${String(escalada.destinatarios)} destinatario(s) en ${String(escalada.latenciaMs)} ms`,
    };
  }
}
