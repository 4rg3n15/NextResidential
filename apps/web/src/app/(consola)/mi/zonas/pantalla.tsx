'use client';

import type { JSX } from 'react';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { EstadoVacio } from '@/componentes/estados';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { useMisZonas } from '@/lib/api/residente';
import type { MiZona } from '@/lib/api/residente';
import { cn } from '@/lib/cn';
import { horaCorta } from '@/lib/fechas';
import { claseDeAncho } from '@/lib/proporcion';
import { Aviso, estadoDeConsulta } from '../comunes';

const Aforo = ({ zona }: { readonly zona: MiZona }): JSX.Element => {
  if (zona.aforoMaximo <= 0) return <p className="text-cuerpo text-texto">Sin límite de aforo</p>;
  const libres = zona.aforoMaximo - zona.ocupacionActual;
  const lleno = libres <= 0;
  const porcentaje = Math.min(100, (zona.ocupacionActual / zona.aforoMaximo) * 100);
  return (
    <div className="space-y-1.5">
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={zona.aforoMaximo}
        aria-valuenow={zona.ocupacionActual}
        aria-label={`${String(zona.ocupacionActual)} de ${String(zona.aforoMaximo)} plazas ocupadas`}
        className="h-2 w-full overflow-hidden rounded-full bg-borde-suave"
      >
        <div
          className={cn(
            'h-full rounded-full',
            lleno ? 'bg-peligro-boton' : 'bg-marca',
            claseDeAncho(porcentaje),
          )}
        />
      </div>
      <p className="text-cuerpo text-texto">
        {lleno
          ? `Lleno · ${String(zona.ocupacionActual)} de ${String(zona.aforoMaximo)}`
          : `Quedan ${String(libres)} de ${String(zona.aforoMaximo)} plazas`}
      </p>
    </div>
  );
};

const TarjetaDeZona = ({ zona }: { readonly zona: MiZona }): JSX.Element => (
  <Tarjeta>
    <CuerpoDeTarjeta className="space-y-3 pt-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-seccion text-texto">{zona.nombre}</h2>
        <Distintivo tono={zona.abiertaAhora ? 'exito' : 'neutro'}>
          {zona.abiertaAhora ? 'Abierta' : 'Cerrada'}
        </Distintivo>
      </div>
      <Aforo zona={zona} />
      <p className="text-secundario text-texto-apagado">
        {zona.franjasDeHoy.length === 0
          ? 'Hoy no tiene horario configurado'
          : `Hoy: ${zona.franjasDeHoy.map((f) => `${horaCorta(f.desde)}–${horaCorta(f.hasta)}`).join(' · ')}`}
      </p>
      {zona.requiereAutorizacion ? (
        <p className="text-secundario text-texto-apagado">
          Tus visitantes necesitan que les autorices esta zona al registrarlos.
        </p>
      ) : null}
    </CuerpoDeTarjeta>
  </Tarjeta>
);

/**
 * M-5 · «Zonas comunes», sólo lectura. El aforo es el de este instante y no
 * reserva plaza: quien controla el cupo es la entrada de la zona (C-04).
 */
export const PantallaDeMisZonas = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const zonas = useMisZonas(copropiedadId);
  const lista = zonas.data ?? [];
  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Zonas comunes"
        descripcion="Aforo y horario de hoy, tal como los ve la entrada de cada zona."
      />
      <Aviso>
        El aforo que ves es el de este momento y puede cambiar. No reserva plaza: quien controla el
        cupo es la entrada de la zona.
      </Aviso>
      {estadoDeConsulta(zonas, 'Cargando las zonas comunes')}
      {zonas.data !== undefined && lista.length === 0 ? (
        <EstadoVacio
          titulo="Sin zonas comunes"
          descripcion="Este conjunto todavía no tiene zonas comunes configuradas. Cuando la administración añada alguna, aparecerá aquí con su aforo."
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {lista.map((z) => (
          <TarjetaDeZona key={z.id} zona={z} />
        ))}
      </div>
    </div>
  );
};
