import type { HallazgoDelEquipo } from '@ncr/providers';

/**
 * C3 (ETAPA 15-L) · «Probar conexión» · EVENTOS, con la respuesta real del
 * equipo: la escucha que la plataforma mantiene abierta y cuándo mandó algo
 * el equipo por ella por última vez (un evento o su propio latido).
 *
 * No se abre una segunda conexión para probar: en un equipo que sirve un solo
 * flujo a la vez, esa prueba le quitaría los eventos a la escucha de verdad
 * mientras dura.
 */
export interface SenalDeEventos {
  readonly transporte: 'escucha' | 'suscripcion' | 'ninguna';
  readonly ultimaSenal: Date | null;
  /**
   * C7 (15-L) · el equipo rechaza la conexión porque otra plataforma —p. ej.
   * HikCentral— la tiene o agotó las que admite: la frase del paquete de
   * equipos, con el remedio. Ausente o `null`: no hay rechazo vigente.
   */
  readonly rechazo?: string | null;
}

export interface LectorDeSenales {
  senal(dispositivoId: string): SenalDeEventos | null;
}
export const LECTOR_DE_SENALES = Symbol.for('ncr.equipos.LectorDeSenales');

/** Una señal más vieja que esto ya no prueba que el flujo siga vivo. */
export const SENAL_RECIENTE_MS = 90_000;

const TRANSPORTE: Readonly<Record<SenalDeEventos['transporte'], string>> = {
  escucha: 'flujo de alertas',
  suscripcion: 'suscripción',
  ninguna: 'sin transporte',
};

export const hallazgoDeEventos = (senal: SenalDeEventos | null, ahora: Date): HallazgoDelEquipo => {
  const base = {
    campo: 'eventos del equipo',
    valorCorrecto: 'escucha abierta, con señal en el último minuto y medio',
    correccion: null,
  } as const;
  if (senal === null) {
    return {
      ...base,
      estado: 'no_comprobado',
      valorLeido: null,
      detalle:
        'La plataforma aún no escucha a este equipo: se abre sola en menos de 30 s tras el alta ' +
        'o la edición (con el proveedor simulado no se escucha). Vuelva a probar en un momento',
    };
  }
  const via = TRANSPORTE[senal.transporte];
  const rechazo = senal.rechazo ?? null;
  if (rechazo !== null) {
    // Sin conexión no llega ningún evento: ni timbres ni veredictos. Es BLOQUEO,
    // y la frase dice quién la tiene y qué hacer (la misma del ensayo).
    return {
      ...base,
      estado: 'bloqueo',
      valorLeido: `${via} rechazado por el equipo`,
      detalle: `${rechazo.charAt(0).toUpperCase()}${rechazo.slice(1)}`,
    };
  }
  if (senal.ultimaSenal === null) {
    return {
      ...base,
      estado: 'aviso',
      valorLeido: `${via} abierto · sin señal todavía`,
      detalle:
        'La escucha está abierta pero el equipo no ha mandado nada: pase por delante o pulse el ' +
        'timbre y vuelva a probar; si sigue sin señal, revise que el equipo publique eventos',
    };
  }
  const segundos = Math.max(0, Math.round((ahora.getTime() - senal.ultimaSenal.getTime()) / 1000));
  const reciente = segundos * 1000 <= SENAL_RECIENTE_MS;
  return {
    ...base,
    estado: reciente ? 'conforme' : 'aviso',
    valorLeido: `${via} · última señal hace ${String(segundos)} s`,
    detalle: reciente
      ? 'El equipo habla con la plataforma: sus eventos llegan a la consola'
      : 'Hace rato que el equipo no manda nada por su escucha: si no se reabre sola, revise la red',
  };
};
