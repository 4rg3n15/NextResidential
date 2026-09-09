import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import {
  ConsultarEventos,
  ExportarEventos,
  ObtenerEvidencia,
} from '../aplicacion/consultar-eventos';
import type { EventoRegistrado, PaginaDeEventos } from '../aplicacion/puertos';
import { CanalEnProceso } from '../infraestructura/canal-en-proceso';
import { ConsultaEventosDto, ExportacionEventosDto } from './dtos';
import { PaginaDeEventosDto, UrlDeEvidenciaDto } from './respuestas';
import { ErrorApiDto } from '../../comun/presentacion/respuestas';
import { aCsv, aExcel, aPdf } from './formatos';

/**
 * Histórico, exportación, evidencia y flujo en vivo — HU-32, RN-21, OE-05.
 *
 * **La copropiedad va en la RUTA y además se comprueba contra el token.** No es
 * redundante: el identificador de la ruta es lo que la suite de aislamiento
 * recorre para intentar la fuga, y la comprobación es lo que la impide. Si la
 * copropiedad solo saliera del token, la ruta sería inatacable pero también
 * imposible de probar, y la suite daría verde sin haber intentado nada.
 */
@ApiTags('eventos')
@ApiBearerAuth()
@Controller('copropiedades/:id/eventos')
export class EventosController {
  constructor(
    @Inject(ConsultarEventos) private readonly consultar: ConsultarEventos,
    @Inject(ExportarEventos) private readonly exportar: ExportarEventos,
    @Inject(ObtenerEvidencia) private readonly evidencia: ObtenerEvidencia,
    @Inject(CanalEnProceso) private readonly canal: CanalEnProceso,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  private desenvolver<T>(r: Resultado<T, ErrorDominio>): T {
    if (r.ok) return r.valor;
    throw new BadRequestException(r.error.detalle);
  }

  @Get()
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'Historial filtrado y paginado por cursor (HU-32)' })
  @ApiOkResponse({ type: PaginaDeEventosDto })
  @ApiNotFoundResponse({
    type: ErrorApiDto,
    description: 'Copropiedad fuera del alcance del token',
  })
  async historial(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Query() dto: ConsultaEventosDto,
  ): Promise<PaginaDeEventos> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'eventos/historial');
    return this.desenvolver(await this.consultar.ejecutar(criteriosDe(copropiedadId, dto)));
  }

  @Get('exportacion')
  @Roles('administrador', 'superadministrador', 'operador_central')
  @ApiOperation({ summary: 'Exporta el historial en CSV, Excel o PDF (HU-32)' })
  // Respuesta binaria: se declaran los tipos de medio en vez de un esquema. Un
  // `type:` aquí mentiría —el cuerpo no es JSON— y el cliente generado
  // intentaría deserializarlo.
  @ApiProduces('text/csv', 'application/vnd.ms-excel', 'application/pdf')
  @ApiOkResponse({
    description: 'Fichero del informe. La cabecera X-NCR-Truncado dice si está completo.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiNotFoundResponse({ type: ErrorApiDto })
  async exportacion(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Query() dto: ExportacionEventosDto,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'eventos/exportacion');
    const { filas, truncado } = this.desenvolver(
      await this.exportar.ejecutar(criteriosDe(copropiedadId, dto)),
    );

    const { cuerpo, tipo, extension } = serializar(dto.formato, filas, dto.desde, dto.hasta);
    // Cabecera explícita cuando el informe no está completo. Entregar un
    // informe truncado sin decirlo es peor que no entregarlo: se firma como si
    // fuera el histórico entero.
    respuesta.setHeader('X-NCR-Truncado', truncado ? 'si' : 'no');
    respuesta.setHeader('Content-Type', tipo);
    respuesta.setHeader(
      'Content-Disposition',
      `attachment; filename="eventos-${dto.desde.slice(0, 10)}.${extension}"`,
    );
    respuesta.send(cuerpo);
  }

  @Get(':eventoId/evidencia')
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'URL firmada de vida corta a la evidencia (RN-21)' })
  @ApiOkResponse({ type: UrlDeEvidenciaDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Sin evidencia, o evento inexistente' })
  async urlDeEvidencia(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('eventoId', ParseUUIDPipe) eventoId: string,
  ): Promise<{ url: string }> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'eventos/evidencia');
    const url = await this.evidencia.ejecutar(copropiedadId, eventoId);
    // 404 y no 204: distinguir «no hay evidencia» de «el evento no existe»
    // permitiría enumerar eventos ajenos contando respuestas.
    if (url === null) throw new NotFoundException('Sin evidencia disponible');
    return { url };
  }

  /**
   * Flujo en vivo por **Server-Sent Events**.
   *
   * SSE y no WebSocket: el flujo es de una sola dirección —la API empuja, la
   * consola escucha—, va sobre HTTP/1.1 sin negociación aparte, atraviesa
   * cualquier proxy corporativo y reconecta solo. Un WebSocket añadiría un
   * protocolo más que asegurar y auditar en la ETAPA 13 para ganar un canal de
   * vuelta que las consolas no usan: sus acciones ya viajan por POST.
   *
   * Este endpoint es además el que hace **medible** la latencia de esta etapa y
   * la contingencia de Supabase Realtime: ver
   * `docs/arquitectura/tiempo-real-y-contingencia.md`.
   */
  @Get('flujo')
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'Flujo de eventos y alertas en vivo (SSE)' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description:
      'Flujo SSE. Temas: «listo» al abrir, «eventos» por cada acceso registrado y ' +
      '«alertas» por cada escalamiento. La carga de cada mensaje es un EventoRegistradoDto ' +
      'o un AlertaExpuestaDto según el tema.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiNotFoundResponse({ type: ErrorApiDto })
  async flujo(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'eventos/flujo');

    respuesta.setHeader('Content-Type', 'text/event-stream');
    respuesta.setHeader('Cache-Control', 'no-cache, no-transform');
    respuesta.setHeader('Connection', 'keep-alive');
    // Sin esto, un proxy con búfer acumula los mensajes y los entrega en
    // bloque: la latencia medida sería la del búfer, no la del sistema.
    respuesta.setHeader('X-Accel-Buffering', 'no');
    respuesta.flushHeaders();

    const baja = this.canal.suscribir(copropiedadId, {
      entregar: (tema, carga) => {
        if (respuesta.writableEnded) return false;
        respuesta.write(`event: ${tema}\ndata: ${JSON.stringify(carga)}\n\n`);
        return true;
      },
    });

    respuesta.write(`event: listo\ndata: {"copropiedadId":"${copropiedadId}"}\n\n`);
    respuesta.on('close', () => {
      baja();
      respuesta.end();
    });
  }
}

/** Traduce el DTO a los criterios del dominio. Traducción, no reglas (§2.2). */
const criteriosDe = (
  copropiedadId: string,
  dto: ConsultaEventosDto,
): Parameters<ConsultarEventos['ejecutar']>[0] => ({
  copropiedadId,
  desde: new Date(dto.desde),
  hasta: new Date(dto.hasta),
  viviendaId: dto.viviendaId ?? null,
  personaId: dto.personaId ?? null,
  dispositivoId: dto.dispositivoId ?? null,
  zonaId: dto.zonaId ?? null,
  tipo: dto.tipo ?? null,
  resultado: dto.resultado ?? null,
  motivo: dto.motivo ?? null,
  ...(dto.tamanoPagina === undefined ? {} : { tamanoPagina: dto.tamanoPagina }),
  cursor: dto.cursor ?? null,
});

const serializar = (
  formato: 'csv' | 'excel' | 'pdf',
  filas: readonly EventoRegistrado[],
  desde: string,
  hasta: string,
): { cuerpo: Buffer; tipo: string; extension: string } => {
  switch (formato) {
    case 'csv':
      return { cuerpo: aCsv(filas), tipo: 'text/csv; charset=utf-8', extension: 'csv' };
    case 'excel':
      return {
        cuerpo: aExcel(filas),
        tipo: 'application/vnd.ms-excel; charset=utf-8',
        extension: 'xls',
      };
    case 'pdf':
      return {
        cuerpo: aPdf(filas, `Historial de eventos ${desde.slice(0, 10)} a ${hasta.slice(0, 10)}`),
        tipo: 'application/pdf',
        extension: 'pdf',
      };
  }
};
