import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles, SinRecursoDeTenant, SinSegundoFactor } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import { REGISTRO_AUDITORIA } from '../../comun/auditoria';
import type { RegistroDeAuditoria } from '../../comun/auditoria';
import type { ContextoTenant } from '../dominio/claims';
import { ROLES_ADMINISTRATIVOS } from '../dominio/claims';
import {
  CodigosDeRecuperacionDto,
  RecuperacionDeFactorDto,
  RestablecimientoRegistradoDto,
  SesionDto,
} from './respuestas';
import { RecuperarFactorDto } from './dtos';
import {
  ADMINISTRADOR_DE_FACTORES,
  REPOSITORIO_CODIGOS_MFA,
} from '../aplicacion/puertos';
import type { AdministradorDeFactores, RepositorioCodigosMfa } from '../aplicacion/puertos';
import { casarCodigo, generarCodigosDeRecuperacion } from '../dominio/codigos-recuperacion';
import { ErrorApiDto } from '../../comun/respuestas';

/**
 * Identidad y alcance del token presentado.
 *
 * **Aquí ya no hay rutas de segundo factor, y esa es la decisión (ADR-008).**
 * Hasta la ETAPA 09-A este controlador exponía `/auth/mfa/inscripcion` y
 * `/auth/mfa/verificacion` con TOTP propio. Eran **inalcanzables**: el guard de
 * autenticación exige `aal2` antes de que actúe el de roles, y las dos rutas
 * exigían rol administrativo, así que un administrador sin segundo factor no
 * podía llegar a inscribirlo. Y aunque hubiera podido, verificar ahí no habría
 * cambiado el `aal` del token —lo emite Supabase—, con lo que tampoco habría
 * desbloqueado nada.
 *
 * Mantener dos fuentes de verdad para el segundo factor es pedir un incidente:
 * una diría que el usuario tiene MFA y la otra que no, y la que decide es la
 * que emite el claim. Supabase Auth es la autoritativa; lo demás se retira en
 * vez de quedarse protegido e inalcanzable, que en la auditoría de la ETAPA 13
 * habría sido un hallazgo seguro.
 *
 * `ROLES_ADMINISTRATIVOS` sigue aquí porque es el conjunto que `aal2` protege:
 * lo aplica el guard, no una ruta.
 */
@ApiTags('autenticacion')
@ApiBearerAuth()
// Opera sobre la identidad del propio llamante: no devuelve ni escribe datos de
// ninguna copropiedad.
@SinRecursoDeTenant()
@Controller('auth')
export class AutenticacionController {
  constructor(
    @Inject(REGISTRO_AUDITORIA) private readonly auditoria: RegistroDeAuditoria,
    @Inject(REPOSITORIO_CODIGOS_MFA) private readonly codigos: RepositorioCodigosMfa,
    @Inject(ADMINISTRADOR_DE_FACTORES) private readonly factores: AdministradorDeFactores,
  ) {}

  @Get('sesion')
  @Roles(...ROLES_ADMINISTRATIVOS, 'portero', 'residente')
  @ApiOperation({ summary: 'Identidad y alcance del token presentado' })
  @ApiOkResponse({ type: SesionDto })
  @ApiUnauthorizedResponse({
    type: ErrorApiDto,
    description:
      'Token ausente, caducado o inválido. También cuando un rol administrativo presenta ' +
      'un token `aal1`: está autenticado, pero no habilitado (RN-20, CA-25).',
  })
  sesion(@Contexto() ctx: ContextoTenant): SesionDto {
    return {
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadId: ctx.copropiedadId,
      copropiedadesAtendidas: [...ctx.copropiedadesAtendidas],
      mfaVerificado: ctx.mfaVerificado,
    };
  }

  /**
   * Deja constancia de que el llamante acaba de restablecer su contraseña.
   *
   * **El cambio de contraseña NO pasa por aquí.** Lo ejecuta Supabase Auth,
   * que es el proveedor autoritativo (ADR-008). Lo que pasa por aquí es el
   * rastro: un cambio de credencial es un hecho auditable (§2.7.8), y si la
   * única huella viviera en los registros de Supabase quedaría fuera del
   * sistema que el operador audita durante un incidente.
   *
   * **`@SinSegundoFactor()` y por qué.** Tras restablecer, la sesión que emite
   * el proveedor es `aal1`: el usuario acaba de demostrar el control del buzón,
   * no el del segundo factor. Sin la exención, un administrador nunca podría
   * registrar su propio restablecimiento — el mismo callejón sin salida que
   * hizo inalcanzables las rutas de MFA retiradas en ADR-008. La ruta no expone
   * ningún recurso de copropiedad ni permite operar: solo escribe sobre quien
   * llama.
   *
   * **Idempotente y sin cuerpo.** No recibe nada del cliente: la identidad sale
   * del token verificado. Un cuerpo con «quién restableció» sería un cuerpo que
   * el cliente controla, y la auditoría dejaría de significar nada.
   */
  @Post('restablecimiento')
  @HttpCode(204)
  @Roles(...ROLES_ADMINISTRATIVOS, 'portero', 'residente')
  @SinSegundoFactor()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registra en auditoría el restablecimiento de la propia contraseña' })
  @ApiNoContentResponse({ type: RestablecimientoRegistradoDto })
  @ApiTooManyRequestsResponse({ type: ErrorApiDto, description: '5 por minuto (§2.7.5)' })
  async registrarRestablecimiento(
    @Contexto() ctx: ContextoTenant,
    @Req() peticion: Request,
  ): Promise<void> {
    await this.auditoria.registrarRestablecimiento({
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      // `ip` y `user-agent` son del transporte, así que se leen aquí y no en el
      // caso de uso. Se admiten nulos: detrás de un proxy pueden no llegar, y
      // un registro sin IP sigue siendo mejor que ningún registro.
      ip: peticion.ip ?? null,
      userAgent: peticion.headers['user-agent'] ?? null,
    });
  }

  /**
   * Genera los códigos de recuperación del segundo factor. Se entregan **una
   * vez**: de aquí en adelante solo existe su hash.
   *
   * **Exige `aal2`, y por eso no lleva exención.** Solo se llama justo después
   * de inscribir y verificar el factor, cuando la sesión ya está elevada. Que
   * un `aal1` pudiera pedir códigos convertiría la contraseña en la única
   * barrera: quien la robara se emitiría su propia llave de recuperación.
   *
   * Regenerar deja sin valor los anteriores. Es deliberado: un juego apuntado
   * en un papel de hace dos años no debe seguir abriendo la puerta.
   */
  @Post('mfa/codigos')
  @Roles(...ROLES_ADMINISTRATIVOS, 'portero', 'residente')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Genera los códigos de recuperación del segundo factor' })
  @ApiCreatedResponse({ type: CodigosDeRecuperacionDto })
  @ApiTooManyRequestsResponse({ type: ErrorApiDto, description: '5 por minuto (§2.7.5)' })
  async generarCodigos(@Contexto() ctx: ContextoTenant): Promise<CodigosDeRecuperacionDto> {
    const { codigos, hashes } = generarCodigosDeRecuperacion();
    await this.codigos.reemplazar(ctx.usuarioId, hashes, ctx.usuarioId);
    return { codigos: [...codigos], cantidad: codigos.length };
  }

  /**
   * Consume un código de recuperación y **retira el factor perdido**.
   *
   * Lo que este endpoint NO hace: dar acceso. No puede — el `aal2` lo emite
   * Supabase (ADR-008) y aquí no se emite ningún token. Lo que hace es
   * desbloquear la reinscripción de quien perdió el teléfono, que es el hueco
   * que Supabase no cubre: su respuesta a ese caso es tener varios factores
   * inscritos, lo que no sirve si solo había uno.
   *
   * **`@SinSegundoFactor()` y por qué es inevitable.** Quien perdió el factor
   * solo puede presentar una sesión `aal1`. Exigir `aal2` aquí sería pedirle
   * justo lo que ha perdido — el mismo callejón sin salida que hizo
   * inalcanzables las rutas de MFA que ADR-008 retiró. La ruta no expone ningún
   * recurso de copropiedad y solo actúa sobre el propio llamante.
   *
   * El límite es de cinco por minuto: son 40 bits de entropía por código, así
   * que adivinar uno a ese ritmo lleva del orden de cien mil años.
   */
  @Post('mfa/recuperacion')
  @HttpCode(200)
  @Roles(...ROLES_ADMINISTRATIVOS, 'portero', 'residente')
  @SinSegundoFactor()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Retira el factor perdido con un código de recuperación' })
  @ApiOkResponse({ type: RecuperacionDeFactorDto })
  @ApiUnauthorizedResponse({ type: ErrorApiDto, description: 'Código no válido o ya usado' })
  @ApiTooManyRequestsResponse({ type: ErrorApiDto, description: '5 por minuto (§2.7.5)' })
  async recuperarFactor(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: RecuperarFactorDto,
    @Req() peticion: Request,
  ): Promise<RecuperacionDeFactorDto> {
    const vigentes = await this.codigos.hashesVigentes(ctx.usuarioId);
    const hash = casarCodigo(dto.codigo, vigentes);

    // Mismo mensaje para «no existe», «ya se usó» y «no hay códigos». Distinguir
    // los tres le diría a quien prueba códigos si va por buen camino.
    const invalido = new UnauthorizedException('Código de recuperación no válido');
    if (hash === null) throw invalido;

    // El consumo decide: si otra petición simultánea se adelantó, aquí devuelve
    // `false`. La unicidad del uso NO se apoya en la comprobación de arriba.
    if (!(await this.codigos.consumir(ctx.usuarioId, hash, peticion.ip ?? null))) throw invalido;

    const factoresRetirados = await this.factores.retirarFactoresVerificados(ctx.usuarioId);
    await this.auditoria.registrarRestablecimiento({
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      ip: peticion.ip ?? null,
      userAgent: peticion.headers['user-agent'] ?? null,
    });

    return {
      factoresRetirados,
      codigosRestantes: (await this.codigos.hashesVigentes(ctx.usuarioId)).length,
    };
  }
}
