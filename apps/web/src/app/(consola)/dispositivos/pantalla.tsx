'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DispositivoDelTablero } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useDispositivos, useDispositivosPendientes } from '@/lib/api/consultas';

type Operacion = 'configuracion' | 'sincronizacion' | 'reinicio';

const ESTADO = {
  saludable: { tono: 'exito', texto: 'En línea' },
  degradado: { tono: 'aviso', texto: 'Degradado' },
  caido: { tono: 'peligro', texto: 'Fuera de línea' },
} as const;

/**
 * Dispositivos y sincronización.
 *
 * **Lo que esta pantalla NO muestra nunca: la credencial del equipo.** Ni
 * completa, ni enmascarada, ni la referencia a la bóveda (RN-21). No hace falta
 * filtrarla: **la API no la devuelve**, y el tipo generado desde el contrato ni
 * siquiera tiene ese campo, así que un descuido aquí no compilaría. Es la
 * diferencia entre ocultar un dato y no tenerlo.
 *
 * **«Sincronizando» es un estado real, no una animación.** Sale de la lista de
 * órdenes encoladas que la API mantiene: cuando alguien pulsa sincronizar, el
 * equipo aparece así hasta que la orden se ejecute. La ejecución contra el
 * hardware llega con la ETAPA 15, y el aviso lo dice en vez de fingir que el
 * equipo ya respondió.
 */
export const PantallaDeDispositivos = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const clientes = useQueryClient();
  const consulta = useDispositivos(copropiedadId);
  const pendientes = useDispositivosPendientes(copropiedadId);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);

  /**
   * Las tres rutas se escriben ENTERAS y no se componen con una plantilla. El
   * cliente está tipado desde el contrato: una ruta armada con interpolación no
   * existiría para TypeScript y habría que forzarla con un `as`, que es
   * exactamente el atajo por el que una ruta mal escrita llega a producción.
   */
  const ordenar = async (id: string, operacion: Operacion): Promise<void> => {
    setEnCurso(`${id}:${operacion}`);
    setError(null);
    const parametros = { params: { path: { id: copropiedadId, dispositivoId: id } } } as const;
    try {
      const r = desenvolver(
        operacion === 'configuracion'
          ? await cliente.POST(
              '/copropiedades/{id}/dispositivos/{dispositivoId}/configuracion',
              parametros,
            )
          : operacion === 'sincronizacion'
            ? await cliente.POST(
                '/copropiedades/{id}/dispositivos/{dispositivoId}/sincronizacion',
                parametros,
              )
            : await cliente.POST(
                '/copropiedades/{id}/dispositivos/{dispositivoId}/reinicio',
                parametros,
              ),
      );
      setAviso(r.detalle);
      await clientes.invalidateQueries({ queryKey: ['dispositivos', copropiedadId] });
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo enviar la orden');
    } finally {
      setEnCurso(null);
    }
  };

  if (consulta.isError) {
    const e = consulta.error;
    return estadoSegunCodigo(
      e instanceof ErrorDeApi ? e.estado : 0,
      e instanceof Error ? e.message : 'Error inesperado',
      () => void consulta.refetch(),
    );
  }

  const sincronizando = new Set(pendientes.data?.dispositivos ?? []);

  const columnas: readonly Columna<DispositivoDelTablero>[] = [
    {
      clave: 'equipo',
      titulo: 'Equipo',
      texto: (d) => `${d.nombre} ${d.tipo}`,
      celda: (d) => (
        <div>
          <p className="font-medium text-texto">{d.nombre}</p>
          <p className="text-secundario text-texto-apagado">{d.tipo.replace(/_/g, ' ')}</p>
        </div>
      ),
    },
    {
      clave: 'red',
      titulo: 'Dirección · firmware',
      texto: (d) => `${d.host ?? ''} ${d.firmware ?? ''}`,
      celda: (d) => (
        <div>
          <p className="font-mono text-secundario text-texto">
            {d.host ?? '—'}
            {d.puerto === null ? '' : `:${d.puerto}`}
          </p>
          <p className="text-secundario text-texto-apagado">
            {d.modelo ?? 'Modelo sin registrar'} · {d.firmware ?? 'firmware desconocido'}
          </p>
        </div>
      ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      texto: (d) => d.estado,
      celda: (d) =>
        sincronizando.has(d.id) ? (
          <Distintivo tono="marca">Sincronizando</Distintivo>
        ) : (
          <Distintivo tono={ESTADO[d.estado].tono}>{ESTADO[d.estado].texto}</Distintivo>
        ),
    },
    {
      clave: 'sincronizacion',
      titulo: 'Última sincronización',
      celda: (d) => (
        <span className="text-secundario text-texto-apagado">
          {d.ultimaSincronizacion === null
            ? 'Nunca'
            : new Date(d.ultimaSincronizacion).toLocaleString('es-CO', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
        </span>
      ),
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alineacion: 'derecha',
      celda: (d) => (
        <div className="flex justify-end gap-1.5">
          {(['configuracion', 'sincronizacion', 'reinicio'] as const).map((op) => (
            <Boton
              key={op}
              variante={op === 'reinicio' ? 'peligro' : 'secundario'}
              tamano="sm"
              cargando={enCurso === `${d.id}:${op}`}
              disabled={enCurso !== null}
              onClick={() => void ordenar(d.id, op)}
            >
              {op === 'configuracion'
                ? 'Configurar'
                : op === 'sincronizacion'
                  ? 'Sincronizar'
                  : 'Reiniciar'}
            </Boton>
          ))}
        </div>
      ),
    },
  ];

  const equipos = consulta.data?.dispositivos ?? [];
  const enLinea = equipos.filter((d) => d.estado === 'saludable').length;

  return (
    <>
      <EncabezadoDePantalla
        titulo="Dispositivos"
        descripcion="Inventario y estado de los equipos. Las credenciales no salen de la API: no hay nada que ocultar aquí porque no llega (RN-21)."
        resumen={
          consulta.data === undefined ? null : (
            <>
              <Distintivo tono="exito">{enLinea} en línea</Distintivo>
              <Distintivo tono="peligro">
                {equipos.filter((d) => d.estado === 'caido').length} fuera de línea
              </Distintivo>
              {sincronizando.size > 0 ? (
                <Distintivo tono="marca">{sincronizando.size} sincronizando</Distintivo>
              ) : null}
            </>
          )
        }
      />

      {aviso !== null ? (
        <p
          role="status"
          className="mb-3 rounded-md border border-borde bg-lienzo px-3 py-2 text-secundario text-texto-apagado"
        >
          {aviso}
        </p>
      ) : null}
      {error !== null ? (
        <p
          role="alert"
          className="mb-3 rounded-md border border-peligro bg-peligro-suave px-3 py-2 text-secundario text-peligro-texto"
        >
          {error}
        </p>
      ) : null}

      <TablaDeDatos
        titulo="Equipos de la copropiedad"
        columnas={columnas}
        filas={equipos}
        claveDeFila={(d) => d.id}
        cargando={consulta.isLoading}
        buscador={{ marcador: 'Buscar por nombre, tipo o dirección' }}
        vacio={{
          titulo: 'Sin dispositivos',
          descripcion:
            'No hay equipos registrados en esta copropiedad. Se registran con la integración de hardware.',
        }}
      />
    </>
  );
};
