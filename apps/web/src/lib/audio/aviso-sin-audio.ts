import { useEffect, useState } from 'react';

/**
 * DT-15S4-02 (15-S6) · una conversación de 90 s sin un solo tramo: el 09/10
 * la guardia pulsó, el medidor «Enviando» no se movió y nadie lo vio. Con el
 * micrófono activo (`hablando`) y cero tramas salidas pasados `plazoMs`, la
 * consola lo dice. El recuento viene del canal (`tramasEnviadas`); si el canal
 * no lo da (un doble antiguo), no se avisa: no se inventa un fallo.
 */
export const PLAZO_SIN_AUDIO_MS = 3000;

export const usarAvisoSinAudio = (
  hablando: boolean,
  tramasEnviadas: number | undefined,
  plazoMs = PLAZO_SIN_AUDIO_MS,
): boolean => {
  const [vencido, setVencido] = useState(false);
  useEffect(() => {
    setVencido(false);
    if (!hablando) return undefined;
    const t = setTimeout(() => setVencido(true), plazoMs);
    return () => clearTimeout(t);
  }, [hablando, plazoMs]);
  return hablando && vencido && tramasEnviadas === 0;
};
