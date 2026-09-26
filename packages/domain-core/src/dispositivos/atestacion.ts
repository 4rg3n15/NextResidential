/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-11 · ¿VALE TODAVÍA LA ATESTACIÓN DEL INSTALADOR?
 *
 * La API no siempre puede afirmar que una cámara no decide: en sitio,
 * `barrierGateOper = 0` convivía con «Paso automático» encendido (H-SITIO-01).
 * La atestación es la prueba FÍSICA —una placa de su lista blanca y una
 * desconocida, ninguna abrió— y vale para el firmware con el que se hizo:
 * otro firmware es otro aparato a efectos de lo que decide solo.
 *
 * Pura: la usan la API (la fila de la consola) y el proveedor (antes de
 * operar, contra el firmware leído EN VIVO del equipo). Un firmware que no se
 * conoce no se da por el mismo: no poder compararlo es no saberlo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type VigenciaDeAtestacion =
  | { readonly vigente: true; readonly firmware: string }
  | { readonly vigente: false; readonly motivo: string };

const normalizado = (firmware: string): string => firmware.trim().replace(/\s+/g, ' ');

export const vigenciaDeAtestacion = (
  atestacion: { readonly firmware: string } | null,
  firmwareActual: string | null,
): VigenciaDeAtestacion => {
  if (atestacion === null) {
    return { vigente: false, motivo: 'ningún instalador ha atestado este equipo' };
  }
  if (firmwareActual === null || normalizado(firmwareActual) === '') {
    return {
      vigente: false,
      motivo:
        `la atestación es del firmware ${atestacion.firmware} y no se pudo leer el del equipo: ` +
        'no se puede confirmar que sea el mismo',
    };
  }
  if (normalizado(firmwareActual) !== normalizado(atestacion.firmware)) {
    return {
      vigente: false,
      motivo:
        `la atestación es del firmware ${atestacion.firmware} y el equipo tiene ` +
        `${firmwareActual}: el instalador debe volver a verificarlo físicamente`,
    };
  }
  return { vigente: true, firmware: normalizado(atestacion.firmware) };
};
