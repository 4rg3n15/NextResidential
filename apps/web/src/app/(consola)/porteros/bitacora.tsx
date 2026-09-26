'use client';

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { HechoDeBitacora, TipoDeHechoDeBitacora } from '@ncr/contracts';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { EstadoError } from '@/componentes/estados';
import { useBitacora } from './consultas';

/**
 * Texto de cada hecho. Pares y no objeto literal: el escáner de secretos lee
 * «…_contrasena: '…'» como una contraseña escrita, y aquí sólo hay rótulos.
 */
const TEXTO = Object.fromEntries([
  ['inicio_de_sesion', 'Ingreso'],
  ['acceso_rechazado', 'Ingreso rechazado'],
  ['cierre_de_sesion', 'Salida'],
  ['inicio_de_patrullaje', 'Sale a patrullar'],
  ['fin_de_patrullaje', 'Vuelve de patrullar'],
  ['codigo_incorrecto', 'Código de patrullaje incorrecto'],
  ['turno_asignado', 'Turno asignado'],
  ['turno_extra', 'Turno extra'],
  ['turno_editado', 'Turno editado'],
  ['turno_retirado', 'Turno retirado'],
  ['solape_de_turno', 'Turnos cruzados'],
  ['alta_de_portero', 'Alta de portero'],
  ['edicion_de_portero', 'Datos del portero'],
  ['restablecimiento_de_contrasena', 'Contraseña restablecida'],
  ['cambio_de_contrasena', 'Contraseña cambiada'],
] as const satisfies readonly (readonly [TipoDeHechoDeBitacora, string])[]) as Readonly<
  Record<TipoDeHechoDeBitacora, string>
>;

const FILTROS: readonly (readonly [TipoDeHechoDeBitacora | 'todos', string])[] = [
  ['todos', 'Todo'],
  ['inicio_de_sesion', 'Ingresos'],
  ['cierre_de_sesion', 'Salidas'],
  ['fin_de_patrullaje', 'Patrullajes'],
  ['acceso_rechazado', 'Rechazos'],
  ['turno_extra', 'Turnos extra'],
  ['restablecimiento_de_contrasena', 'Restablecimientos'],
];

const duracion = (s: number | null): string => {
  if (s === null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
};

const COLUMNAS: readonly Columna<HechoDeBitacora>[] = [
  {
    clave: 'cuando',
    titulo: 'Cuándo',
    celda: (h) =>
      new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(h.ocurridoEn),
      ),
  },
  { clave: 'que', titulo: 'Qué', celda: (h) => TEXTO[h.tipo], texto: (h) => TEXTO[h.tipo] },
  {
    clave: 'quien',
    titulo: 'Portero',
    celda: (h) => h.nombreUsuario ?? '—',
    texto: (h) => h.nombreUsuario ?? '',
  },
  {
    clave: 'actor',
    titulo: 'Hecho por',
    celda: (h) =>
      h.actorId === h.usuarioId ? 'El propio portero' : (h.nombreActor ?? 'Superadministrador'),
  },
  {
    clave: 'origen',
    titulo: 'Origen',
    celda: (h) => h.origenDeclarado ?? h.origenIp ?? '—',
    texto: (h) => h.origenDeclarado ?? h.origenIp ?? '',
  },
  {
    clave: 'duracion',
    titulo: 'Duración',
    celda: (h) => duracion(h.duracionSegundos),
    alineacion: 'derecha',
  },
  {
    clave: 'detalle',
    titulo: 'Detalle',
    celda: (h) => h.detalle ?? '',
    texto: (h) => h.detalle ?? '',
  },
];

/**
 * BITÁCORA DE PORTERÍA (B4). Ingresos y salidas con su origen, patrullajes con
 * su duración, turnos y restablecimientos, de la tabla append-only: lo que
 * aquí aparece no lo puede borrar nadie, tampoco el dueño de la base.
 *
 * El ORIGEN es el que declaró la consola (la dirección del navegador); cuando
 * falta, la que llamó a la API. Sirve para ver un acceso remoto, no para
 * probarlo: la decisión pendiente P-16 es si ese acceso exigirá segundo factor.
 */
export const BitacoraDePorteria = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const [tipo, setTipo] = useState<TipoDeHechoDeBitacora | 'todos'>('todos');
  const { desde, hasta } = useMemo(() => {
    const ahora = Date.now();
    return { desde: new Date(ahora - 14 * 86_400_000), hasta: new Date(ahora + 60_000) };
  }, []);
  const hechos = useBitacora(copropiedadId, tipo, desde, hasta);

  if (hechos.isError) {
    return (
      <EstadoError descripcion={hechos.error.message} alReintentar={() => void hechos.refetch()} />
    );
  }
  return (
    <TablaDeDatos
      titulo="Bitácora de portería · últimos 14 días"
      columnas={COLUMNAS}
      filas={hechos.data ?? []}
      claveDeFila={(h) => h.id}
      cargando={hechos.isPending}
      vacio={{
        titulo: 'Sin hechos',
        descripcion: 'No hay ingresos, patrullajes ni cambios en el periodo.',
      }}
      buscador={{ marcador: 'Buscar por portero, origen o detalle' }}
      filtros={
        <label className="flex items-center gap-2 text-secundario">
          <span>Mostrar</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeHechoDeBitacora | 'todos')}
            className="rounded-campo border border-borde bg-campo px-2 py-1 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            {FILTROS.map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
};
