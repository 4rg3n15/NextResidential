import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Portero } from '@ncr/contracts';
import { sesionActual } from '@/lib/sesion/servidor';
import { tokenVigente } from '@/lib/sesion/token';
import { configuracion } from '@/lib/configuracion';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { EstadoError, EstadoSinPermiso } from '@/componentes/estados';
import { Tarjeta } from '@/componentes/ui/tarjeta';

export const metadata: Metadata = { title: 'Mi perfil' };
export const dynamic = 'force-dynamic';

const perfil = async (): Promise<Portero | null> => {
  const token = await tokenVigente();
  if (token === null) return null;
  try {
    const r = await fetch(`${configuracion().apiUrl}/porteria/perfil`, {
      headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    return r.ok ? ((await r.json()) as Portero) : null;
  } catch {
    return null;
  }
};

const Fila = ({
  etiqueta,
  valor,
}: {
  readonly etiqueta: string;
  readonly valor: string;
}): JSX.Element => (
  <div className="grid gap-1 border-b border-borde-suave py-2 sm:grid-cols-3">
    <dt className="text-secundario text-texto-apagado">{etiqueta}</dt>
    <dd className="text-cuerpo text-texto sm:col-span-2">{valor}</dd>
  </div>
);

/**
 * PERFIL DEL PORTERO · SOLO LECTURA (E-02).
 *
 * No hay formulario porque no hay ruta que lo guarde: la API no expone la
 * edición al portero y la base se lo impide también (`tg_usuario_campos_propios`).
 * Si un dato está mal, lo corrige el superadministrador.
 */
const MiPerfil = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  if (sesion.rol !== 'portero')
    return <EstadoSinPermiso descripcion="Esta página es del portero." />;
  const p = await perfil();
  if (p === null) return <EstadoError descripcion="No se pudo leer tu perfil de portero." />;
  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Mi perfil"
        descripcion="Tus datos los registra el superadministrador. Si alguno está mal, pídele que lo corrija."
      />
      <Tarjeta className="p-4">
        <dl>
          <Fila etiqueta="Nombre" valor={p.nombre} />
          <Fila etiqueta="Usuario" valor={p.usuario ?? '—'} />
          <Fila etiqueta="Teléfono" valor={p.telefono ?? '—'} />
          <Fila etiqueta="Correo de contacto" valor={p.correoContacto ?? '—'} />
          <Fila etiqueta="Portería" valor={p.porteria ?? '—'} />
          <Fila
            etiqueta="Torres, sectores o fincas"
            valor={p.sectores.length === 0 ? '—' : p.sectores.join(', ')}
          />
          <Fila
            etiqueta="Turno actual"
            valor={
              p.turnoVigente === null
                ? '—'
                : `${p.turnoVigente.horaInicio}–${p.turnoVigente.horaFin}${p.turnoVigente.cruzaMedianoche ? ' (termina al día siguiente)' : ''}`
            }
          />
        </dl>
      </Tarjeta>
    </div>
  );
};

export default MiPerfil;
