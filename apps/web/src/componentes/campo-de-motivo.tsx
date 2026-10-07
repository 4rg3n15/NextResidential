'use client';

import type { JSX } from 'react';
import { Campo } from './ui/campo';
import { MINIMO_MOTIVO } from './dialogo-confirmacion';
import { LONGITUD_MAXIMA_DE_MOTIVO, motivoNormalizado } from './dialogo-motivo';

/**
 * EL MOTIVO DE UN CAMBIO QUE QUEDA EN LA BITÁCORA · ronda 15-W.
 *
 * Asignar vivienda a una cuenta, reanudar el registro y cambiar un tope de
 * plazas piden lo mismo: un motivo de 5 a 300 caracteres que la API guarda con
 * el nombre de quien lo escribió. Son cuatro diálogos; si cada uno repitiera la
 * cota y la normalización, el día que la API cambie una de las dos se
 * separarían. Aquí se escribe una vez, con las piezas que ya existían —la
 * normalización del servidor (NFC, espacios colapsados, recorte) y sus
 * longitudes—, no con una regla nueva.
 *
 * La consola OCULTA, no protege: el botón de envío no se habilita con un
 * motivo corto, pero el rechazo real es el 400 del servidor.
 */
export const motivoValido = (crudo: string): boolean => {
  const longitud = motivoNormalizado(crudo).length;
  return longitud >= MINIMO_MOTIVO && longitud <= LONGITUD_MAXIMA_DE_MOTIVO;
};

/** Lo que viaja: el motivo tal como lo guardará el servidor. */
export const motivoParaEnviar = (crudo: string): string => motivoNormalizado(crudo);

export const CampoDeMotivo = ({
  valor,
  cambiar,
  etiqueta = 'Motivo',
  ayuda = `Obligatorio, de ${String(MINIMO_MOTIVO)} a ${String(LONGITUD_MAXIMA_DE_MOTIVO)} caracteres. Queda en la auditoría con tu nombre.`,
}: {
  readonly valor: string;
  readonly cambiar: (valor: string) => void;
  readonly etiqueta?: string;
  readonly ayuda?: string;
}): JSX.Element => (
  <Campo
    etiqueta={etiqueta}
    name="motivo"
    value={valor}
    onChange={(e) => cambiar(e.target.value)}
    maxLength={LONGITUD_MAXIMA_DE_MOTIVO}
    required
    ayuda={ayuda}
    error={
      valor !== '' && !motivoValido(valor)
        ? `Escribe al menos ${String(MINIMO_MOTIVO)} caracteres`
        : undefined
    }
  />
);
