import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Aforo, FranjaHoraria, HorarioDeZona } from '@ncr/domain-core';
import type { ErrorDominio, Resultado, Zona } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_ZONAS } from '../aplicacion/puertos';
import type { RepositorioZonas } from '../aplicacion/puertos';
import {
  AutorizarZonaAVisitante,
  ConfigurarZona,
  LiberarAforo,
  ValidarAforo,
} from '../aplicacion/casos-de-uso';
import { AutorizarZonaDto, ConfigurarZonaDto } from './dtos';
import { ConteoDto, PermisoDeZonaDto, VeredictoDeIngresoDto, ZonaDto } from './respuestas';

/**
 * Zonas comunes — HU-18, HU-19, HU-20, CU-05.
 *
 * La copropiedad va en la ruta **y además** se comprueba contra el token: el
 * identificador de la ruta es lo que la suite de aislamiento recorre para
 * intentar la fuga, y la comprobación es lo que la impide.
 */
@ApiTags('zonas')
@ApiBearerAuth()
@Controller('copropiedades/:id/zonas')
export class ZonasController {
  constructor(
    @Inject(REPOSITORIO_ZONAS) private readonly zonas: RepositorioZonas,
    @Inject(ValidarAforo) private readonly validar: ValidarAforo,
    @Inject(LiberarAforo) private readonly liberar: LiberarAforo,
    @Inject(ConfigurarZona) private readonly configurar: ConfigurarZona,
    @Inject(AutorizarZonaAVisitante) private readonly autorizar: AutorizarZonaAVisitante,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central', 'residente')
  @ApiOperation({ summary: 'Zonas con su aforo y su disponibilidad de ahora mismo (HU-19)' })
  @ApiOkResponse({ type: [ZonaDto] })
  async listar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<ZonaDto[]> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'zonas');
    const ahora = new Date();
    return (await this.zonas.listar(copropiedadId)).map((z) => exponer(z, ahora));
  }

  @Post(':zonaId/configuracion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Configura horario, aforo, normas y apertura de la zona (HU-18)' })
  @ApiOkResponse({ type: ZonaDto })
  async configuracion(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('zonaId', ParseUUIDPipe) zonaId: string,
    @Body() dto: ConfigurarZonaDto,
  ): Promise<ZonaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'zonas/configuracion');

    const zona = await this.zonas.porId(copropiedadId, zonaId);
    if (zona === null) throw new NotFoundException('La zona no existe en esta copropiedad');

    const cambios: Parameters<ConfigurarZona['ejecutar']>[3] = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.politicaReinicio !== undefined) cambios.politicaReinicio = dto.politicaReinicio;
    if (dto.normas !== undefined) cambios.normas = dto.normas;
    if (dto.abierta !== undefined) cambios.abierta = dto.abierta;

    if (dto.aforoMaximo !== undefined) {
      // El conteo se conserva: cambiar el máximo de una zona con gente dentro
      // no la vacía. Si el máximo nuevo es menor que el conteo, el objeto de
      // valor lo rechaza y el administrador se entera en vez de dejar la fila
      // en un estado que el CHECK de la base tampoco admitiría.
      cambios.aforo = desenvolver(Aforo.crear(dto.aforoMaximo, zona.aforo.actual));
    }
    if (dto.horario !== undefined) {
      const franjas = dto.horario.map((f) =>
        desenvolver(
          FranjaHoraria.crear({
            dia: f.dia,
            minutoInicio: f.minutoInicio,
            minutoFin: f.minutoFin,
            continuaDelDiaAnterior: f.continuaDelDiaAnterior ?? false,
          }),
        ),
      );
      cambios.horario = desenvolver(
        HorarioDeZona.crear(franjas, zona.horario.desplazamientoUtcMinutos),
      );
    }

    const actualizada = desenvolver(
      await this.configurar.ejecutar(copropiedadId, zonaId, ctx.usuarioId, cambios),
    );
    return exponer(actualizada, new Date());
  }

  @Post(':zonaId/ingresos')
  @Roles('portero', 'operador_central', 'administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Ocupa una plaza; el aforo lo garantiza la base (CU-05, CA-14, CA-15)',
  })
  @ApiOkResponse({ type: VeredictoDeIngresoDto })
  async ingreso(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('zonaId', ParseUUIDPipe) zonaId: string,
  ): Promise<VeredictoDeIngresoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'zonas/ingresos');

    const veredicto = await this.validar.ejecutar(copropiedadId, zonaId);
    // La denegación es 200 con motivo, no un error HTTP: el intento es legítimo
    // y su respuesta es una decisión de negocio que además va a un evento
    // (RN-02). Un 409 la convertiría en un fallo del llamante.
    return veredicto.admitido
      ? { admitido: true, conteo: veredicto.conteo, motivo: null }
      : { admitido: false, conteo: null, motivo: veredicto.motivo };
  }

  @Post(':zonaId/salidas')
  @Roles('portero', 'operador_central', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Libera una plaza; nunca baja de cero (CU-05 6a)' })
  @ApiOkResponse({ type: ConteoDto })
  async salida(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('zonaId', ParseUUIDPipe) zonaId: string,
  ): Promise<ConteoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'zonas/salidas');
    return { conteo: await this.liberar.ejecutar(copropiedadId, zonaId) };
  }

  @Post(':zonaId/autorizaciones')
  @Roles('administrador', 'superadministrador', 'residente')
  @ApiOperation({ summary: 'Da permiso sobre la zona a una autorización (HU-19, HU-20)' })
  @ApiOkResponse({ type: PermisoDeZonaDto })
  async permiso(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('zonaId', ParseUUIDPipe) zonaId: string,
    @Body() dto: AutorizarZonaDto,
  ): Promise<PermisoDeZonaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'zonas/autorizaciones');
    return desenvolver(
      await this.autorizar.ejecutar(copropiedadId, dto.autorizacionId, zonaId, ctx.usuarioId),
    );
  }
}

/** El agregado NO se serializa crudo (§2.2): sale un DTO. */
const exponer = (zona: Zona, ahora: Date): ZonaDto => {
  const alDia = zona.conAforoAlDia(ahora);
  const disponibilidad = zona.disponibilidadEn(ahora);
  return {
    id: alDia.id,
    nombre: alDia.nombre,
    tipo: alDia.tipo,
    abierta: alDia.abierta,
    politicaReinicio: alDia.politicaReinicio,
    normas: [...alDia.normas],
    aforoMaximo: alDia.aforo.maximo,
    aforoActual: alDia.aforo.actual,
    aforoDisponible: alDia.aforo.disponible,
    dentroDeHorario: disponibilidad.dentroDeHorario,
    aforoCompleto: disponibilidad.aforoCompleto,
    // El horario SALE, y no es un adorno: una franja con
    // `continuaDelDiaAnterior` es lo que distingue «cierra a medianoche» de
    // «sigue abierta hasta las 02:00», y la pantalla tiene que poder decirlo.
    horario: alDia.horario.franjas.map((f) => ({
      dia: f.dia,
      minutoInicio: f.minutoInicio,
      minutoFin: f.minutoFin,
      continuaDelDiaAnterior: f.continuaDelDiaAnterior,
    })),
    desplazamientoUtcMinutos: alDia.horario.desplazamientoUtcMinutos,
    // P-15: no hay módulo de reservas todavía. Se devuelve vacío en vez de
    // omitir el campo: un campo ausente obligaría a la consola a adivinar si
    // es que no hay reservas o si es que la API es de otra versión.
    reservasDelDia: [],
  };
};

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  switch (r.error.codigo) {
    case 'ENTIDAD_NO_ENCONTRADA':
      throw new NotFoundException(r.error.detalle);
    case 'INVARIANTE_VIOLADA':
    case 'CONFLICTO_DE_CONCURRENCIA':
      throw new ConflictException(r.error.detalle);
    default:
      throw new BadRequestException(r.error.detalle);
  }
};
