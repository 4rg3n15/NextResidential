import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type {
  CorrectorDeEquipo,
  DatosDeEquipo,
  OlvidoDeEquipo,
  RepositorioDeEquipos,
  ResultadoDeCorreccionDeEquipo,
} from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS DOS ACCIONES DE LA FICHA PARA EL DÍA DE ENTREGA · corrección de la 15-L
 *
 *  · C2 · «Enviar eventos a este Mac»: la IP del Mac cambia según la red, y
 *    con ella el servidor de alarmas que la cámara tiene escrito. Aquí se
 *    decide adónde apuntarla —la IP del Mac en la red de la cámara, o
 *    `ALARM_SERVER_IP_ANUNCIADA`—, con el puerto de esta API y la ruta con el
 *    secreto de la cámara (el suyo, emitido en el alta —C6, 15-M—, o el de
 *    `ALARM_SERVER_EQUIPOS` para la cámara declarada a mano).
 *  · F2 (e) · «Verificación remota: activar/desactivar»: el plan B sin código.
 *
 * Las dos leen de vuelta (lo hace el proveedor), quedan en la auditoría con el
 * valor anterior y el nuevo —nunca el secreto— y hacen OLVIDAR al proceso lo
 * que recordaba del equipo, como cualquier cambio en su ficha (C1).
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** La IP de este Mac vista desde un equipo. La implementa la infraestructura. */
export interface ResolutorDeIpDelMac {
  hacia(
    hostDelEquipo: string,
  ): { readonly ip: string } | { readonly ip: null; readonly motivo: string };
}

/**
 * El secreto con el que la cámara se acredita en el servidor de alarmas.
 * C6 (15-M) · el propio de la cámara, el declarado en el .env o uno recién
 * emitido, en ese orden: siempre hay uno, y quien lo elige es la infraestructura.
 */
export interface SecretosDelAlarmServer {
  secretoPara(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipo: Pick<DatosDeEquipo, 'id' | 'host'>,
  ): Promise<string>;
}

export type RepositorioDeLaFicha = Pick<
  RepositorioDeEquipos,
  'listar' | 'credencialPara' | 'auditarCorreccion'
>;

const noEncontrado = (): ErrorDominio =>
  errorDominio('ENTIDAD_NO_ENCONTRADA', 'No se encontró el equipo', 'RN-15');

const conCredencial = async (
  repo: RepositorioDeLaFicha,
  ctx: ContextoTenant,
  copropiedadId: string,
  equipoId: string,
): Promise<
  Resultado<{ readonly equipo: DatosDeEquipo; readonly secreto: string }, ErrorDominio>
> => {
  const equipo = (await repo.listar(ctx, copropiedadId)).find((e) => e.id === equipoId);
  // Uno de otra copropiedad y uno que no existe se ven igual (RN-15).
  if (equipo === undefined) return fallo(noEncontrado());
  const secreto = await repo.credencialPara(ctx, copropiedadId, equipoId);
  if (secreto === null) {
    return fallo(
      errorDominio(
        'ENTIDAD_NO_ENCONTRADA',
        'El equipo no tiene credencial guardada: vuelva a escribirla en la edición, porque el ' +
          'sistema no la muestra ni la reenvía',
      ),
    );
  }
  return exito({ equipo, secreto });
};

const accesoDe = (equipo: DatosDeEquipo, secreto: string) => ({
  host: equipo.host,
  puerto: equipo.puerto,
  protocolo: equipo.protocolo,
  usuario: equipo.usuario ?? '',
  secreto,
});

/** E4 (15-M) · los tipos que admiten un receptor HTTP («HTTP listening»). */
export const PUBLICAN_POR_SERVIDOR_DE_ALARMAS: ReadonlySet<DatosDeEquipo['tipo']> = new Set([
  'camara_lpr',
  'terminal_facial',
  'intercom',
]);
/** E4 (15-M) · los que la plataforma ESCUCHA: su receptor es un resto huérfano. */
export const ESCUCHADOS_POR_LA_PLATAFORMA: ReadonlySet<DatosDeEquipo['tipo']> = new Set([
  'terminal_facial',
  'intercom',
]);

export class EnviarEventosAEsteMac {
  constructor(
    private readonly repo: RepositorioDeLaFicha,
    private readonly corrector: CorrectorDeEquipo,
    private readonly ips: ResolutorDeIpDelMac,
    private readonly secretos: SecretosDelAlarmServer,
    private readonly puertoDeLaApi: number,
    private readonly olvido: OlvidoDeEquipo,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    motivo: string,
  ): Promise<Resultado<ResultadoDeCorreccionDeEquipo, ErrorDominio>> {
    const leido = await conCredencial(this.repo, ctx, copropiedadId, equipoId);
    if (!leido.ok) return leido;
    const { equipo, secreto } = leido.valor;
    // E4 (15-M) · todo equipo que PUBLIQUE por servidor de alarmas: la cámara
    // siempre; la terminal y el videoportero también lo admiten (aunque la
    // API los escuche, en sitio los tres tenían un receptor escrito).
    if (!PUBLICAN_POR_SERVIDOR_DE_ALARMAS.has(equipo.tipo)) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          'Este equipo no publica en un servidor de alarmas: el relé y el controlador de E/S ' +
            'no emiten eventos por HTTP',
        ),
      );
    }
    const ip = this.ips.hacia(equipo.host);
    if (ip.ip === null) return fallo(errorDominio('OPERACION_NO_PERMITIDA', ip.motivo));
    // C6 (15-M) · el secreto de ESTA cámara: propio, declarado o recién emitido.
    const secretoDeRuta = await this.secretos.secretoPara(ctx, copropiedadId, equipo);

    const resultado = await this.corrector.corregir({
      ...accesoDe(equipo, secreto),
      correccion: 'receptor_de_eventos',
      confirmadaPor: ctx.usuarioId,
      receptor: { ip: ip.ip, puerto: this.puertoDeLaApi, ruta: `/alarm-server/${secretoDeRuta}` },
    });
    await this.repo.auditarCorreccion(
      ctx,
      copropiedadId,
      `${equipo.nombre} · servidor de alarmas: ${resultado.valorAnterior ?? '(sin valor)'} → ` +
        `${resultado.valorNuevo ?? '(sin cambio)'} · ${motivo}`,
    );
    this.olvido.olvidar(equipo.id);
    return exito(resultado);
  }
}

export class CambiarVerificacionRemota {
  constructor(
    private readonly repo: RepositorioDeLaFicha,
    private readonly corrector: CorrectorDeEquipo,
    private readonly olvido: OlvidoDeEquipo,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    activar: boolean,
    motivo: string,
  ): Promise<Resultado<ResultadoDeCorreccionDeEquipo, ErrorDominio>> {
    const leido = await conCredencial(this.repo, ctx, copropiedadId, equipoId);
    if (!leido.ok) return leido;
    const { equipo, secreto } = leido.valor;
    if (equipo.tipo !== 'terminal_facial') {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          'La verificación remota es de la terminal facial: los demás equipos no esperan veredicto',
        ),
      );
    }
    const resultado = await this.corrector.corregir({
      ...accesoDe(equipo, secreto),
      correccion: 'verificacion_remota',
      confirmadaPor: ctx.usuarioId,
      activar,
    });
    await this.repo.auditarCorreccion(
      ctx,
      copropiedadId,
      `${equipo.nombre} · verificación remota: ${resultado.valorAnterior ?? '(sin valor)'} → ` +
        `${resultado.valorNuevo ?? '(sin cambio)'} · ${motivo}`,
    );
    this.olvido.olvidar(equipo.id);
    return exito(resultado);
  }
}

/**
 * E4 (15-M) · «Desactivar el receptor huérfano». La terminal y el videoportero
 * no necesitan publicar: la plataforma los ESCUCHA por su flujo. El receptor
 * que traían del sitio (un «HTTP listening» a una dirección que ya no existe)
 * reintenta en vano; aquí se apaga, se lee de vuelta y queda en la auditoría
 * por el mismo camino que la verificación remota.
 */
export class DesactivarReceptorHuerfano {
  constructor(
    private readonly repo: RepositorioDeLaFicha,
    private readonly corrector: CorrectorDeEquipo,
    private readonly olvido: OlvidoDeEquipo,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    motivo: string,
  ): Promise<Resultado<ResultadoDeCorreccionDeEquipo, ErrorDominio>> {
    const leido = await conCredencial(this.repo, ctx, copropiedadId, equipoId);
    if (!leido.ok) return leido;
    const { equipo, secreto } = leido.valor;
    if (!ESCUCHADOS_POR_LA_PLATAFORMA.has(equipo.tipo)) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          'Sólo la terminal y el videoportero tienen un receptor huérfano: la cámara SÍ necesita ' +
            'publicar en el servidor de alarmas (use «Enviar eventos a este Mac»)',
        ),
      );
    }
    const resultado = await this.corrector.corregir({
      ...accesoDe(equipo, secreto),
      correccion: 'desactivar_receptor',
      confirmadaPor: ctx.usuarioId,
    });
    await this.repo.auditarCorreccion(
      ctx,
      copropiedadId,
      `${equipo.nombre} · receptor huérfano: ${resultado.valorAnterior ?? '(sin valor)'} → ` +
        `${resultado.valorNuevo ?? '(sin cambio)'} · ${motivo}`,
    );
    this.olvido.olvidar(equipo.id);
    return exito(resultado);
  }
}
