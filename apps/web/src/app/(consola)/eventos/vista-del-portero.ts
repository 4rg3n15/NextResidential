'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Rol } from '@ncr/contracts';

/**
 * D-145 · decisión del cliente (23/10): se conservan TODOS los eventos. La
 * administración y la superadministración nunca limpian; al portero se le
 * limpia la VISTA: cada día empieza vacía (corte automático a las 00:00 de
 * Bogotá) y puede pulsar «Limpiar» para no ver lo anterior a ese instante.
 *
 * **Nada de esto toca `eventos`** (RN-03, CA-23, ADR-05): el instante del
 * «Limpiar» se guarda en ESTE navegador y sólo adelanta el `desde` de la
 * consulta. Si el navegador no deja guardar (modo privado, almacenamiento
 * bloqueado), la vista sigue limpia mientras dure la página, y nada falla.
 *
 * D-146 · decisión del cliente (27/10): el corte es SÓLO de la vista del día.
 * El portero puede consultar, buscar y filtrar días anteriores como la
 * administración; en cuanto toca las fechas o un filtro, este corte no aplica
 * (`rangoDeLaVista`). P-42 queda resuelta: la API no restringe por fecha.
 */
export const ROLES_CON_VISTA_LIMPIABLE: readonly Rol[] = ['portero'];

const clave = (copropiedadId: string): string => `ncr.eventos.limpiadoEn.${copropiedadId}`;

const leer = (copropiedadId: string): Date | null => {
  try {
    const v = window.localStorage.getItem(clave(copropiedadId));
    if (v === null) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const guardar = (copropiedadId: string, d: Date): void => {
  try {
    window.localStorage.setItem(clave(copropiedadId), d.toISOString());
  } catch {
    // Sin almacenamiento la vista queda limpia hasta recargar: es una comodidad.
  }
};

export interface VistaDelPortero {
  readonly delPortero: boolean;
  readonly limpiadoEn: Date | null;
  /**
   * `false` mientras el portero no tiene leído su «Limpiar» guardado: hasta
   * entonces no se pide ni se enseña nada, para no mostrar el día entero un
   * instante (p. ej. desde la caché) antes de aplicar el corte.
   */
  readonly lista: boolean;
  /** El reloj de la vista: avanza cada minuto para cortar a medianoche sin recargar. */
  readonly ahora: Date;
  readonly limpiar: () => void;
}

export const useVistaDelPortero = (copropiedadId: string, rol: Rol): VistaDelPortero => {
  const delPortero = ROLES_CON_VISTA_LIMPIABLE.includes(rol);
  const [limpiadoEn, setLimpiadoEn] = useState<Date | null>(null);
  const [leido, setLeido] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  // Se lee tras montar, no al renderizar: el servidor no tiene `localStorage`
  // y leerlo en el primer render haría que cliente y servidor no coincidieran.
  useEffect(() => {
    if (delPortero) setLimpiadoEn(leer(copropiedadId));
    setLeido(true);
  }, [copropiedadId, delPortero]);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const limpiar = useCallback(() => {
    if (!delPortero) return;
    const ya = new Date();
    guardar(copropiedadId, ya);
    setLimpiadoEn(ya);
    setAhora(ya);
  }, [copropiedadId, delPortero]);

  return {
    delPortero,
    limpiadoEn: delPortero ? limpiadoEn : null,
    lista: !delPortero || leido,
    ahora,
    limpiar,
  };
};
