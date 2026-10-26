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
 * PENDIENTE DE DEFINICIÓN (P-42) · que la API niegue al portero el historial anterior
 * a su día. Hoy el corte es de la interfaz: la API le sigue respondiendo el
 * rango que pida (la autorización por rol de `/eventos` no cambia en este PR).
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
  /** El reloj de la vista: avanza cada minuto para cortar a medianoche sin recargar. */
  readonly ahora: Date;
  readonly limpiar: () => void;
}

export const useVistaDelPortero = (copropiedadId: string, rol: Rol): VistaDelPortero => {
  const delPortero = ROLES_CON_VISTA_LIMPIABLE.includes(rol);
  const [limpiadoEn, setLimpiadoEn] = useState<Date | null>(null);
  const [ahora, setAhora] = useState(() => new Date());

  // Se lee tras montar, no al renderizar: el servidor no tiene `localStorage`
  // y leerlo en el primer render haría que cliente y servidor no coincidieran.
  useEffect(() => {
    if (delPortero) setLimpiadoEn(leer(copropiedadId));
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

  return { delPortero, limpiadoEn: delPortero ? limpiadoEn : null, ahora, limpiar };
};
