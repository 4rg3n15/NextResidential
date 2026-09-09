import type { JSX } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Tarjeta } from './ui/tarjeta';
import { EstadoError, Esqueleto } from './estados';

/**
 * Tarjeta de indicador — las cuatro de W-02.
 *
 * **Cada tarjeta gestiona su propio estado de carga y de error**, y no lo hereda
 * del tablero. Es una exigencia explícita de la auditoría: «una tarjeta caída no
 * debe tumbar el tablero» (`03-mockups.md`, estados ausentes de W-02). Por eso
 * la API expone tres endpoints y no uno agregado.
 *
 * El delta («+4 nuevo») lleva signo y palabra, no solo color: sin la palabra,
 * quien no percibe el matiz no sabe si subió o bajó (§5.6.2).
 */
export type TonoDeKpi = 'marca' | 'exito' | 'aviso' | 'neutro';

const PASTILLA: Readonly<Record<TonoDeKpi, string>> = {
  marca: 'bg-marca-suave text-marca-texto',
  exito: 'bg-exito-suave text-exito-texto',
  aviso: 'bg-aviso-suave text-aviso-texto',
  neutro: 'bg-neutro-suave text-neutro-texto',
};

export interface PropiedadesDeTarjetaKpi {
  readonly etiqueta: string;
  readonly valor: number | null;
  readonly detalle?: string | undefined;
  readonly tono?: TonoDeKpi;
  readonly icono: ReactNode;
  readonly cargando?: boolean;
  readonly error?: { readonly descripcion: string; readonly alReintentar?: () => void } | undefined;
}

export const TarjetaKpi = ({
  etiqueta,
  valor,
  detalle,
  tono = 'marca',
  icono,
  cargando = false,
  error,
}: PropiedadesDeTarjetaKpi): JSX.Element => (
  <Tarjeta className="p-5">
    {error !== undefined ? (
      <EstadoError
        titulo={etiqueta}
        descripcion={error.descripcion}
        alReintentar={error.alReintentar}
      />
    ) : (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-etiqueta uppercase text-texto-apagado">{etiqueta}</p>
          {cargando ? (
            <Esqueleto className="mt-2 h-8 w-20" />
          ) : (
            // `tabular-nums` para que la cifra no baile al actualizarse en vivo.
            <p className="mt-1 text-cifra tabular-nums text-texto">
              {valor === null ? '—' : valor.toLocaleString('es-CO')}
            </p>
          )}
          {detalle !== undefined && !cargando ? (
            <p className="mt-1 text-secundario text-texto-apagado">{detalle}</p>
          ) : null}
        </div>
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-tarjeta',
            PASTILLA[tono],
          )}
          aria-hidden="true"
        >
          {icono}
        </span>
      </div>
    )}
  </Tarjeta>
);
