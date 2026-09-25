import type { Reloj } from '@ncr/domain-core';
import type { BitacoraDeIdentidad } from '../../comun/bitacora-de-identidad';
import type { ProveedorDeIdentidad } from '../../cuentas';
import { duracionSegundos } from '../dominio/turno';
import {
  MAXIMO_DE_INTENTOS,
  alDesbloquear,
  alIniciarPatrullaje,
  intentosAgotados,
} from '../dominio/sesion-de-porteria';
import type { ControlDeSesiones, IdentidadDeLaPeticion } from './control-de-sesiones';
import type { CodigoDePatrullaje, RepositorioDeSesiones } from './puertos';

export interface EstadoDeLaSesion {
  readonly estado: 'activa' | 'patrullaje' | 'cerrada' | 'fuera_de_turno' | 'sin_registro';
  /** Sólo con la sesión ACTIVA: en patrullaje mostrarlo sería regalar el desbloqueo. */
  readonly codigo: string | null;
  readonly turnoInicio: string | null;
  readonly turnoFin: string | null;
  readonly porteria: string | null;
  readonly intentosRestantes: number | null;
  readonly patrullajeDesde: string | null;
  readonly motivoCierre: string | null;
}

export type ResultadoDeDesbloqueo = 'desbloqueada' | 'incorrecto' | 'agotado' | 'no_en_patrullaje';

const vacio = (
  estado: EstadoDeLaSesion['estado'],
  motivoCierre: string | null = null,
): EstadoDeLaSesion => ({
  estado,
  codigo: null,
  turnoInicio: null,
  turnoFin: null,
  porteria: null,
  intentosRestantes: null,
  patrullajeDesde: null,
  motivoCierre,
});

/**
 * PATRULLAJE · bloqueo de pantalla impuesto en el servidor (ADR-024).
 *
 * El estado vive en la BASE, no en la pestaña: recargar la consola vuelve a
 * preguntar aquí y aquí sigue en patrullaje. El quinto código incorrecto
 * cierra la sesión del todo —aquí y en el proveedor— y hace falta volver a
 * entrar con la contraseña.
 */
export class Patrullaje {
  constructor(
    private readonly control: ControlDeSesiones,
    private readonly sesiones: RepositorioDeSesiones,
    private readonly codigo: CodigoDePatrullaje,
    private readonly proveedor: ProveedorDeIdentidad,
    private readonly bitacora: BitacoraDeIdentidad,
    private readonly reloj: Reloj,
  ) {}

  async estado(id: IdentidadDeLaPeticion): Promise<EstadoDeLaSesion> {
    const v = await this.control.validar(id);
    if (v.tipo === 'sin_registro' || v.tipo === 'fuera_de_turno') return vacio(v.tipo);
    if (v.tipo === 'cerrada') return vacio('cerrada', v.motivo);
    return {
      estado: v.tipo,
      codigo:
        v.tipo === 'activa'
          ? this.codigo.derivar(v.sesion.copropiedadId, v.turno.id, v.sesion.porteroId)
          : null,
      turnoInicio: v.turno.franja.inicio.toISOString(),
      turnoFin: v.turno.franja.fin.toISOString(),
      porteria: v.turno.porteria,
      intentosRestantes: MAXIMO_DE_INTENTOS - v.sesion.intentosFallidos,
      patrullajeDesde: v.sesion.patrullajeDesde?.toISOString() ?? null,
      motivoCierre: null,
    };
  }

  async iniciar(id: IdentidadDeLaPeticion): Promise<boolean> {
    const v = await this.control.validar(id);
    if (v.tipo === 'patrullaje') return true;
    if (v.tipo !== 'activa') return false;
    const ahora = this.reloj.ahora();
    const cambio = alIniciarPatrullaje(v.sesion, ahora);
    if (cambio === null) return false;
    await this.sesiones.actualizar(
      v.sesion.copropiedadId,
      v.sesion.sesionId,
      cambio,
      v.sesion.porteroId,
    );
    await this.bitacora.anotar({
      tipo: 'inicio_de_patrullaje',
      copropiedadId: v.sesion.copropiedadId,
      ocurridoEn: ahora,
      usuarioId: v.sesion.porteroId,
      actorId: v.sesion.porteroId,
      sesionId: v.sesion.sesionId,
      turnoId: v.turno.id,
    });
    return true;
  }

  async desbloquear(
    id: IdentidadDeLaPeticion,
    codigo: string,
    accessToken: string | null,
  ): Promise<ResultadoDeDesbloqueo> {
    const v = await this.control.validar(id);
    if (v.tipo !== 'patrullaje') return 'no_en_patrullaje';
    const s = v.sesion;
    const ahora = this.reloj.ahora();
    const base = {
      copropiedadId: s.copropiedadId,
      ocurridoEn: ahora,
      usuarioId: s.porteroId,
      actorId: s.porteroId,
      sesionId: s.sesionId,
      turnoId: v.turno.id,
    };
    if (await this.codigo.coincide(codigo, s.codigoHash)) {
      await this.sesiones.actualizar(s.copropiedadId, s.sesionId, alDesbloquear(), s.porteroId);
      await this.bitacora.anotar({
        ...base,
        tipo: 'fin_de_patrullaje',
        duracionSegundos: duracionSegundos(s.patrullajeDesde ?? ahora, ahora),
      });
      return 'desbloqueada';
    }
    const intentos = await this.sesiones.registrarIntentoFallido(
      s.copropiedadId,
      s.sesionId,
      s.porteroId,
    );
    await this.bitacora.anotar({
      ...base,
      tipo: 'codigo_incorrecto',
      detalle: `intento ${intentos ?? '?'}`,
    });
    if (intentos === null || !intentosAgotados(intentos)) return 'incorrecto';

    await this.control.cerrar(s, 'intentos_agotados', s.porteroId);
    if (accessToken !== null) await this.proveedor.cerrarSesion(accessToken);
    return 'agotado';
  }
}
