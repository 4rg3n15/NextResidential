import type { EquipoDeclarado } from '../../comun/equipos-de-alarm-server';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * R1 (ETAPA 15-L) · DE QUIÉN ES EL EQUIPO QUE PUBLICA
 *
 * Hasta la 15-L la copropiedad de un evento se buscaba SÓLO en
 * `ALARM_SERVER_EQUIPOS`. La guía de sitio dice, con razón, que la terminal y
 * el videoportero NO se declaran ahí: se dan de alta en la consola y la API
 * abre su flujo sola. Resultado: todo lo que emitía una terminal se descartaba
 * por «equipo sin copropiedad», y la terminal esperaba su plazo y negaba.
 *
 * Ahora manda el REGISTRO DE EQUIPOS (la tabla `dispositivos`, que es lo que
 * la consola escribe), y la variable queda para lo que es: acreditar a la
 * cámara que publica en el Alarm Server. Y si los dos contestan distinto no se
 * elige uno: un evento en la copropiedad equivocada es una fuga entre
 * inquilinos (RN-15), y perderlo con un motivo en la bitácora es la dirección
 * segura.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Declarado aquí por el CONSUMIDOR (§2.2); lo satisface el módulo de equipos. */
export interface LocalizadorDeCopropiedadDeEquipo {
  copropiedadDe(dispositivoId: string): Promise<string | null>;
}

export type CopropiedadDelEquipo =
  | { readonly copropiedadId: string; readonly fuente: 'registro' | 'declaracion' }
  | { readonly copropiedadId: null; readonly motivo: string };

/** Para quien no tiene registro (pruebas sin base): sólo cuenta la declaración. */
export const sinRegistroDeEquipos: LocalizadorDeCopropiedadDeEquipo = {
  copropiedadDe: async () => null,
};

export class CopropiedadDelEquipoPorRegistro {
  constructor(
    private readonly registro: LocalizadorDeCopropiedadDeEquipo,
    private readonly declarados: readonly EquipoDeclarado[],
  ) {}

  async resolver(dispositivoId: string): Promise<CopropiedadDelEquipo> {
    const declarada =
      this.declarados.find((e) => e.dispositivoId === dispositivoId)?.copropiedadId ?? null;
    let registrada: string | null;
    try {
      registrada = await this.registro.copropiedadDe(dispositivoId);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      return declarada === null
        ? {
            copropiedadId: null,
            motivo: `no se pudo leer el registro de equipos (${detalle})`,
          }
        : { copropiedadId: declarada, fuente: 'declaracion' };
    }
    if (registrada !== null && declarada !== null && registrada !== declarada) {
      return {
        copropiedadId: null,
        motivo:
          'el registro de equipos y ALARM_SERVER_EQUIPOS le asignan copropiedades distintas; ' +
          'no se adivina cuál es la buena: corrija una de las dos',
      };
    }
    if (registrada !== null) return { copropiedadId: registrada, fuente: 'registro' };
    if (declarada !== null) return { copropiedadId: declarada, fuente: 'declaracion' };
    return {
      copropiedadId: null,
      motivo: 'el equipo no está activo en la consola ni declarado en ALARM_SERVER_EQUIPOS',
    };
  }
}
