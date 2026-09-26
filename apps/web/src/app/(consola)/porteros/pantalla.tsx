'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { Portero } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { EstadoError } from '@/componentes/estados';
import { usePorteros } from './consultas';
import { DialogoDePortero, DialogoDeRestablecimiento } from './dialogo-portero';
import { CalendarioDeTurnos } from './calendario-de-turnos';
import { BitacoraDePorteria } from './bitacora';

const hora = (iso: string): string =>
  new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * PANEL DE SUPERVISIÓN DE PORTERÍA · superadministrador (B4, ADR-024).
 *
 * Tres secciones con el patrón visual de la consola —encabezado, tabla,
 * tarjeta—: quién está de turno y con sesión ahora, el calendario por día y
 * hora, y la bitácora append-only. Todo sale de la API por el cliente
 * generado; nada se consulta a la base desde el navegador.
 */
export const PantallaDePorteros = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const porteros = usePorteros(copropiedadId);
  const [editar, setEditar] = useState<Portero | null | 'nuevo'>(null);
  const [restablecer, setRestablecer] = useState<Portero | null>(null);
  const lista = porteros.data ?? [];
  const deTurno = lista.filter((p) => p.turnoVigente !== null).length;

  const acciones = (p: Portero): JSX.Element => (
    <div className="flex justify-end gap-1">
      <Boton variante="fantasma" tamano="sm" onClick={() => setEditar(p)}>
        Datos
      </Boton>
      <Boton variante="fantasma" tamano="sm" onClick={() => setRestablecer(p)}>
        Restablecer contraseña
      </Boton>
    </div>
  );

  const columnas: readonly Columna<Portero>[] = [
    {
      clave: 'nombre',
      titulo: 'Portero',
      celda: (p) => (
        <div>
          <p className="font-medium text-texto">{p.nombre}</p>
          <p className="text-secundario text-texto-apagado">{p.usuario ?? 'cuenta por correo'}</p>
        </div>
      ),
      texto: (p) => `${p.nombre} ${p.usuario ?? ''}`,
    },
    {
      clave: 'porteria',
      titulo: 'Portería y sectores',
      celda: (p) => [p.porteria ?? '—', ...p.sectores].join(' · '),
      texto: (p) => [p.porteria ?? '', ...p.sectores].join(' '),
    },
    {
      clave: 'turno',
      titulo: 'Turno',
      celda: (p) =>
        p.turnoVigente === null ? (
          <Distintivo tono="neutro">Sin turno ahora</Distintivo>
        ) : (
          <Distintivo tono="exito">
            De turno hasta {hora(p.turnoVigente.fin)}
            {p.turnoVigente.tipo === 'extra' ? ' (extra)' : ''}
          </Distintivo>
        ),
    },
    {
      clave: 'sesion',
      titulo: 'Sesión',
      celda: (p) =>
        p.sesionAbierta === null ? (
          <span className="text-secundario text-texto-apagado">Sin sesión</span>
        ) : p.sesionAbierta.estado === 'patrullaje' ? (
          <Distintivo tono="aviso">
            Patrullando desde {hora(p.sesionAbierta.patrullajeDesde ?? p.sesionAbierta.iniciadaEn)}
          </Distintivo>
        ) : (
          <Distintivo tono="exito">
            Desde {hora(p.sesionAbierta.iniciadaEn)}
            {p.sesionAbierta.origen === null ? '' : ` · ${p.sesionAbierta.origen}`}
          </Distintivo>
        ),
    },
    {
      clave: 'cuenta',
      titulo: 'Cuenta',
      celda: (p) =>
        p.debeCambiarContrasena ? (
          <Distintivo tono="aviso">Cambio de contraseña pendiente</Distintivo>
        ) : null,
    },
    { clave: 'acciones', titulo: 'Acciones', celda: acciones, alineacion: 'derecha' },
  ];

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Porteros"
        descripcion="Personal de portería, sus turnos y lo que hicieron. Sólo el superadministrador da de alta, asigna turnos y restablece contraseñas."
        resumen={porteros.isSuccess ? `${deTurno} de ${lista.length} de turno ahora` : undefined}
        acciones={<Boton onClick={() => setEditar('nuevo')}>Nuevo portero</Boton>}
      />
      {porteros.isError ? (
        <EstadoError
          descripcion={porteros.error.message}
          alReintentar={() => void porteros.refetch()}
        />
      ) : (
        <TablaDeDatos
          titulo="Porteros de la copropiedad"
          columnas={columnas}
          filas={lista}
          claveDeFila={(p) => p.usuarioId}
          cargando={porteros.isPending}
          vacio={{
            titulo: 'Sin porteros',
            descripcion: 'Da de alta el primero con «Nuevo portero».',
          }}
          buscador={{ marcador: 'Buscar por nombre, usuario o portería' }}
        />
      )}
      <CalendarioDeTurnos copropiedadId={copropiedadId} porteros={lista} />
      <BitacoraDePorteria copropiedadId={copropiedadId} />
      <DialogoDePortero
        copropiedadId={copropiedadId}
        abierto={editar !== null}
        portero={editar === 'nuevo' ? null : editar}
        alCerrar={() => setEditar(null)}
      />
      <DialogoDeRestablecimiento
        copropiedadId={copropiedadId}
        portero={restablecer}
        alCerrar={() => setRestablecer(null)}
      />
    </div>
  );
};
