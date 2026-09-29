'use client';

import { useEffect, useState } from 'react';
import { ahoraLocal } from './fechas';

/**
 * Otros fallos (15-M) · la fecha y la hora que propone un formulario de visita
 * son las de ABRIRLO, no las de montar la pantalla.
 *
 * Los diálogos se montan con la página y se abren mucho después. Con la hora
 * del montaje, una portería que abrió la pantalla a las 07:00 y registró una
 * visita a las 10:30 mandaba «desde las 07:00»: con 2 h la API la rechazaba
 * por vigencia vencida, y con 4 h vencía a las 11:00 sin que nadie lo viera.
 * `reponer` sirve también para «registrar otra» sin cerrar el diálogo.
 */
export const useCuandoAlAbrir = (
  abierto: boolean,
): {
  readonly fecha: string;
  readonly hora: string;
  readonly setFecha: (fecha: string) => void;
  readonly setHora: (hora: string) => void;
  readonly reponer: () => void;
} => {
  const [fecha, setFecha] = useState(() => ahoraLocal().fecha);
  const [hora, setHora] = useState(() => ahoraLocal().hora);
  const reponer = (): void => {
    const ahora = ahoraLocal();
    setFecha(ahora.fecha);
    setHora(ahora.hora);
  };
  useEffect(() => {
    if (abierto) reponer();
    // Lo que decide es la apertura: `reponer` cambia con cada render.
  }, [abierto]);
  return { fecha, hora, setFecha, setHora, reponer };
};
