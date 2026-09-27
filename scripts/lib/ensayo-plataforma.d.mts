import type { Pool } from 'pg';

export interface EventoVisto {
  readonly titulo: string;
  readonly ocurridoEn: Date;
}

export function eventosDeLaPlataforma(
  pool: Pool,
  opciones?: { readonly intervaloMs?: number },
): {
  primeroDesde(host: string, desde: Date, plazoMs: number): Promise<EventoVisto | null>;
};

export function equipoRegistrado(
  pool: Pool,
  host: string,
): Promise<{ readonly nombre: string; readonly copropiedad: string }[]>;

export function migracionesPendientes(pool: Pool, carpeta: string): Promise<string[] | null>;

export function sondearSalud(
  url: string,
  plazoMs?: number,
): Promise<{
  readonly alcanzada: boolean;
  readonly ok: boolean;
  readonly estado: number | null;
  readonly motivo?: string;
}>;
