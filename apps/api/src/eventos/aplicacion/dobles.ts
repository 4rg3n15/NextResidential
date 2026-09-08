import { VersionDeReglas, esFallo, negar, permitir } from '@ncr/domain-core';
import type {
  Bitacora,
  GeneradorDeId,
  NivelBitacora,
  Reloj,
  ResultadoAcceso,
} from '@ncr/domain-core';
import type { CanalTiempoReal, MotorDeDecision, NotificadorPush } from './puertos';

/**
 * Dobles compartidos por las pruebas de esta capa.
 *
 * Viven en `src/` y no en `test/` porque los usan las pruebas unitarias que
 * están junto al código, y duplicarlos en cada fichero es cómo dos pruebas
 * empiezan a medir cosas distintas creyendo que miden lo mismo. No se exportan
 * por el módulo: nada de producción los importa.
 */

export const relojFijo = (instante: Date): Reloj & { avanzar(ms: number): void } => {
  let ahora = new Date(instante.getTime());
  return {
    ahora: () => new Date(ahora.getTime()),
    avanzar: (ms: number) => {
      ahora = new Date(ahora.getTime() + ms);
    },
  };
};

export const idsSecuenciales = (prefijo = 'id'): GeneradorDeId => {
  let n = 0;
  return { nuevo: () => `${prefijo}-${++n}` };
};

export interface BitacoraDePrueba extends Bitacora {
  readonly lineas: { nivel: NivelBitacora; mensaje: string; contexto?: Record<string, unknown> }[];
}

export const bitacoraDePrueba = (): BitacoraDePrueba => {
  const lineas: { nivel: NivelBitacora; mensaje: string; contexto?: Record<string, unknown> }[] =
    [];
  return {
    lineas,
    registrar: (nivel, mensaje, contexto) => {
      lineas.push(
        contexto === undefined ? { nivel, mensaje } : { nivel, mensaje, contexto: { ...contexto } },
      );
    },
  };
};

/** Canal que cuenta destinatarios; el número es lo que mide KPI-25. */
export const canalCon = (
  destinatarios: number,
): CanalTiempoReal & { publicaciones: { tema: string; copropiedadId: string }[] } => {
  const publicaciones: { tema: string; copropiedadId: string }[] = [];
  return {
    publicaciones,
    publicar: async (copropiedadId, tema) => {
      publicaciones.push({ copropiedadId, tema });
      return destinatarios;
    },
  };
};

export const canalQueFalla = (): CanalTiempoReal => ({
  publicar: async () => {
    throw new Error('transporte caído');
  },
});

export const pushDePrueba = (): NotificadorPush & { avisos: string[] } => {
  const avisos: string[] = [];
  return {
    avisos,
    aVivienda: async (_c, viviendaId, titulo) => {
      avisos.push(`${viviendaId}:${titulo}`);
      return 1;
    },
  };
};

export const version = (copropiedadId: string, numero = 1): VersionDeReglas => {
  const v = VersionDeReglas.crear(numero, copropiedadId);
  if (esFallo(v)) throw new Error(v.error.detalle);
  return v.valor;
};

export const motorQue = (decision: ResultadoAcceso): MotorDeDecision => ({
  decidir: async () => decision,
});

export const motorPermite = (copropiedadId: string, dudoso = false): MotorDeDecision =>
  motorQue(permitir(version(copropiedadId), 'prueba.permite', dudoso));

export const motorNiega = (
  copropiedadId: string,
  motivo: Parameters<typeof negar>[0],
): MotorDeDecision => motorQue(negar(motivo, version(copropiedadId), 'prueba.niega'));
