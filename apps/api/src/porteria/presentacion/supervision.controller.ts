import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { GestionDePorteros } from '../aplicacion/porteros';
import type { DatosDelPortero, RechazoDePortero } from '../aplicacion/porteros';
import { CalendarioDeTurnos } from '../aplicacion/turnos';
import type { RechazoDeTurno, TurnoConSolapes } from '../aplicacion/turnos';
import type { DatosDeTurno } from '../aplicacion/puertos';
import { PanelDeSupervision } from '../aplicacion/supervision';
import {
  AltaDePorteroDto,
  BitacoraDePorteriaDto,
  ConsultaDeBitacoraDto,
  DatosDeTurnoDto,
  DatosDelPorteroDto,
  HechoDePorteriaDto,
  PorteroCreadoDto,
  PorterosDto,
  RangoDto,
  RetiroDeTurnoDto,
  TurnoGuardadoDto,
  TurnosDto,
} from './dtos';
import { aHechoDto, aPorteroDto, aTurnoDto } from './mapeadores';

const datosDelPortero = (d: DatosDelPorteroDto): DatosDelPortero => ({
  nombre: d.nombre,
  telefono: d.telefono ?? null,
  correoContacto: d.correoContacto ?? null,
  porteria: d.porteria ?? null,
  sectores: d.sectores,
});

const datosDeTurno = (d: DatosDeTurnoDto): DatosDeTurno => ({
  porteroId: d.porteroId,
  porteria: d.porteria ?? null,
  dia: d.dia,
  horaInicio: d.horaInicio,
  horaFin: d.horaFin,
  tipo: d.tipo,
  motivo: d.motivo ?? null,
});

const rechazoDePortero = (e: RechazoDePortero): Error =>
  e.motivo === 'FORMATO'
    ? new BadRequestException(e.detalle)
    : e.motivo === 'DUPLICADO'
      ? new ConflictException('Ese usuario ya existe en esta copropiedad')
      : e.motivo === 'NO_ENCONTRADO'
        ? new NotFoundException('Portero no encontrado')
        : new BadRequestException('El proveedor de identidad rechazó el alta');

const rechazoDeTurno = (e: RechazoDeTurno): Error =>
  e.motivo === 'FORMATO'
    ? new BadRequestException(e.detalle)
    : e.motivo === 'TERMINADO'
      ? new ConflictException('El turno ya terminó: es historia y no se modifica')
      : new NotFoundException('Turno o portero no encontrado');

const instante = (v: string, campo: string): Date => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${campo} no es una fecha válida`);
  return d;
};

const aGuardado = (r: TurnoConSolapes): TurnoGuardadoDto => ({
  turno: aTurnoDto(r.turno),
  solapes: r.solapes.map(aTurnoDto),
});

/**
 * PANEL DE SUPERVISIÓN DEL SUPERADMINISTRADOR (B4, ADR-024).
 *
 * Porteros y quién está de turno; alta y datos; calendario de turnos con los
 * extra; y la bitácora append-only de ingresos, patrullajes y cambios. Todo
 * bajo `copropiedades/:id` con `exigirAlcance`, y todo de un solo rol: ni el
 * administrador asigna turnos ni el portero se los asigna.
 */
@ApiTags('porteria')
@ApiBearerAuth()
@Roles('superadministrador')
@Controller('copropiedades/:id')
export class SupervisionController {
  constructor(
    @Inject(GestionDePorteros) private readonly porteros: GestionDePorteros,
    @Inject(CalendarioDeTurnos) private readonly calendario: CalendarioDeTurnos,
    @Inject(PanelDeSupervision) private readonly panel: PanelDeSupervision,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('porteros')
  @ApiOperation({ summary: 'Porteros de la copropiedad, quién está de turno y con sesión' })
  @ApiOkResponse({ type: PorterosDto })
  async listar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PorterosDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/porteros');
    return { porteros: (await this.porteros.listar(id)).map(aPorteroDto) };
  }

  @Post('porteros')
  @ApiOperation({
    summary: 'Alta de portero con usuario y contraseña inicial (cambio obligatorio)',
  })
  @ApiOkResponse({ type: PorteroCreadoDto })
  async alta(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AltaDePorteroDto,
  ): Promise<PorteroCreadoDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/alta');
    const r = await this.porteros.alta(ctx, id, {
      ...datosDelPortero(dto),
      usuario: dto.usuario,
      contrasenaInicial: dto.contrasenaInicial,
    });
    if (!r.ok) throw rechazoDePortero(r.error);
    return { usuarioId: r.valor.usuarioId };
  }

  @Put('porteros/:usuarioId')
  @ApiOperation({
    summary: 'Datos del portero (nombre, teléfono, correo de contacto, portería, sectores)',
  })
  @ApiOkResponse({ type: HechoDePorteriaDto })
  async editar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: DatosDelPorteroDto,
  ): Promise<HechoDePorteriaDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/edicion');
    const r = await this.porteros.editar(ctx, id, usuarioId, datosDelPortero(dto));
    if (!r.ok) throw rechazoDePortero(r.error);
    return { hecho: 'portero_editado' };
  }

  @Get('turnos')
  @ApiOperation({ summary: 'Calendario de turnos en un rango (hasta 62 días)' })
  @ApiOkResponse({ type: TurnosDto })
  async turnos(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: RangoDto,
  ): Promise<TurnosDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/turnos');
    const r = await this.calendario.listar(
      id,
      instante(q.desde, 'desde'),
      instante(q.hasta, 'hasta'),
    );
    if (!r.ok) throw rechazoDeTurno(r.error);
    return { turnos: r.valor.map(aTurnoDto) };
  }

  @Post('turnos')
  @ApiOperation({
    summary: 'Asigna un turno (programado o extra con motivo); los solapes se registran',
  })
  @ApiOkResponse({ type: TurnoGuardadoDto })
  async asignar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DatosDeTurnoDto,
  ): Promise<TurnoGuardadoDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/turno-alta');
    const r = await this.calendario.asignar(ctx, id, datosDeTurno(dto));
    if (!r.ok) throw rechazoDeTurno(r.error);
    return aGuardado(r.valor);
  }

  @Put('turnos/:turnoId')
  @ApiOperation({ summary: 'Edita un turno que no ha terminado' })
  @ApiOkResponse({ type: TurnoGuardadoDto })
  async editarTurno(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('turnoId', ParseUUIDPipe) turnoId: string,
    @Body() dto: DatosDeTurnoDto,
  ): Promise<TurnoGuardadoDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/turno-edicion');
    const r = await this.calendario.editar(ctx, id, turnoId, datosDeTurno(dto));
    if (!r.ok) throw rechazoDeTurno(r.error);
    return aGuardado(r.valor);
  }

  @Post('turnos/:turnoId/retiro')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retira un turno que no ha terminado, con motivo' })
  @ApiOkResponse({ type: HechoDePorteriaDto })
  async retirar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('turnoId', ParseUUIDPipe) turnoId: string,
    @Body() dto: RetiroDeTurnoDto,
  ): Promise<HechoDePorteriaDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/turno-retiro');
    const r = await this.calendario.retirar(ctx, id, turnoId, dto.motivo);
    if (!r.ok) throw rechazoDeTurno(r.error);
    return { hecho: 'turno_retirado' };
  }

  @Get('porteria/bitacora')
  @ApiOperation({
    summary: 'Bitácora append-only: ingresos con origen, patrullajes, turnos, restablecimientos',
  })
  @ApiOkResponse({ type: BitacoraDePorteriaDto })
  async bitacora(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ConsultaDeBitacoraDto,
  ): Promise<BitacoraDePorteriaDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/bitacora');
    const desde = instante(q.desde, 'desde');
    const hasta = instante(q.hasta, 'hasta');
    if (hasta.getTime() <= desde.getTime())
      throw new BadRequestException('hasta debe ser posterior a desde');
    const hechos = await this.panel.hechos(
      id,
      desde,
      hasta,
      q.tipo === undefined ? undefined : [q.tipo],
    );
    return { hechos: hechos.map(aHechoDto) };
  }
}
