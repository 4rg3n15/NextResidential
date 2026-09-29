'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { Car, History, UserRoundPlus, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { EstadoVacio } from '@/componentes/estados';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { useMiVivienda, useMisAutorizaciones, useMisNotificaciones } from '@/lib/api/residente';
import { cn } from '@/lib/cn';
import {
  Aviso,
  FilaDeAutorizacion,
  Seccion,
  estadoDeConsulta,
  legible,
  tituloDeVivienda,
} from './comunes';

const ESTADO_ADMINISTRATIVO: Readonly<Record<string, string>> = {
  al_dia: 'Al día',
  en_mora: 'En mora',
};

const AccesoRapido = ({
  icono: Icono,
  etiqueta,
  ruta,
  deshabilitado = false,
}: {
  readonly icono: LucideIcon;
  readonly etiqueta: string;
  readonly ruta: string;
  readonly deshabilitado?: boolean;
}): JSX.Element =>
  deshabilitado ? (
    <span
      aria-disabled="true"
      className="flex items-center gap-3 rounded-tarjeta border border-borde bg-tarjeta px-4 py-3 text-cuerpo text-texto-apagado opacity-60"
    >
      <Icono aria-hidden="true" className="h-5 w-5" />
      {etiqueta}
    </span>
  ) : (
    <Link
      href={ruta}
      prefetch={false}
      className={cn(
        'flex items-center gap-3 rounded-tarjeta border border-borde bg-tarjeta px-4 py-3 text-cuerpo font-medium text-texto',
        'hover:bg-borde-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto',
      )}
    >
      <Icono aria-hidden="true" className="h-5 w-5 text-marca-texto" />
      {etiqueta}
    </Link>
  );

/**
 * M-1 · «Mi vivienda»: la tarjeta de la vivienda con su estado, los cuatro
 * accesos rápidos de la app y la actividad reciente (las últimas cuatro
 * autorizaciones). Si puede autorizar lo decide el servidor (`puedeAutorizar`):
 * la consola no recompone RN-13 ni RN-05.
 */
export const PantallaDeInicio = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const hogar = useMiVivienda(copropiedadId);
  const autorizaciones = useMisAutorizaciones(copropiedadId);
  const notificaciones = useMisNotificaciones(copropiedadId);

  const estado = estadoDeConsulta(hogar, 'Cargando tu vivienda');
  if (estado !== null || hogar.data === undefined) {
    return (
      <div className="space-y-6">
        <EncabezadoDePantalla
          titulo="Mi vivienda"
          descripcion="Lo que el conjunto tiene registrado a tu nombre."
        />
        {estado}
      </div>
    );
  }

  const v = hogar.data.vivienda;
  const alDia = v.estadoAdministrativo === 'al_dia';
  const recientes = (autorizaciones.data ?? []).slice(0, 4);
  const avisos = notificaciones.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Mi vivienda"
        descripcion="Lo que el conjunto tiene registrado a tu nombre."
      />

      <Tarjeta>
        <CuerpoDeTarjeta className="space-y-2 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-seccion font-bold text-texto">{tituloDeVivienda(v)}</p>
            <Distintivo tono={alDia ? 'exito' : 'aviso'}>
              {legible(v.estadoAdministrativo, ESTADO_ADMINISTRATIVO)}
            </Distintivo>
          </div>
          <p className="text-secundario text-texto-apagado">{v.copropiedadNombre}</p>
          {v.direccion !== null ? (
            <p className="text-secundario text-texto-apagado">{v.direccion}</p>
          ) : null}
          <p className="text-secundario text-texto-apagado">
            {hogar.data.vinculo.esTitular
              ? 'Eres el titular de la vivienda.'
              : 'Eres residente de la vivienda.'}
          </p>
          {!v.activa ? (
            <Aviso tono="aviso">
              Tu vivienda está inactiva: las autorizaciones vigentes siguen valiendo y no se pueden
              crear nuevas. Consulta con la administración.
            </Aviso>
          ) : null}
        </CuerpoDeTarjeta>
      </Tarjeta>

      <Link
        href="/mi/notificaciones"
        prefetch={false}
        className="flex items-center justify-between rounded-tarjeta border border-borde bg-tarjeta px-4 py-3 text-cuerpo text-texto hover:bg-borde-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
      >
        <span className="font-medium">Notificaciones</span>
        <span className="text-secundario text-texto-apagado">
          {avisos === 0 ? 'Nada nuevo' : `${String(avisos)} aviso(s)`}
        </span>
      </Link>

      <Seccion titulo="Accesos rápidos">
        <div className="grid gap-3 sm:grid-cols-2">
          <AccesoRapido
            icono={UserRoundPlus}
            etiqueta="Registrar visita"
            ruta="/mi/visitas"
            deshabilitado={!hogar.data.puedeAutorizar}
          />
          <AccesoRapido icono={Car} etiqueta="Mis vehículos" ruta="/mi/vehiculos" />
          <AccesoRapido icono={Users} etiqueta="Mi familia" ruta="/mi/familia" />
          <AccesoRapido icono={History} etiqueta="Historial" ruta="/mi/historial" />
        </div>
        {!hogar.data.puedeAutorizar ? (
          <Aviso>
            {v.activa
              ? 'Hoy sólo el titular de la vivienda puede autorizar visitantes.'
              : 'Con la vivienda inactiva no se pueden registrar visitas nuevas.'}
          </Aviso>
        ) : null}
      </Seccion>

      <Seccion
        titulo="Actividad reciente"
        accion={
          <Link
            href="/mi/visitas"
            prefetch={false}
            className="text-secundario font-medium text-marca-texto"
          >
            Ver todo
          </Link>
        }
      >
        {estadoDeConsulta(autorizaciones, 'Cargando tus visitas')}
        {autorizaciones.data !== undefined && recientes.length === 0 ? (
          <EstadoVacio
            titulo="Sin visitas autorizadas por ahora"
            descripcion="Cuando registres una visita aparecerá aquí."
          />
        ) : null}
        {recientes.length > 0 ? (
          <Tarjeta>
            <ul className="px-5">
              {recientes.map((a) => (
                <FilaDeAutorizacion key={a.id} a={a} />
              ))}
            </ul>
          </Tarjeta>
        ) : null}
      </Seccion>
    </div>
  );
};
