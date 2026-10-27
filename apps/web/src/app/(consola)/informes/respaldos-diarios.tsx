'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { EstadoDelEnvioDelRespaldo, RespaldoDiario } from '@ncr/contracts';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';
import { estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi } from '@/lib/api/cliente';
import { pedirDescargaDeRespaldo, useRespaldosDiarios } from '@/lib/api/respaldos';

/**
 * D-147 · LOS RESPALDOS DIARIOS DE LOS EVENTOS
 *
 * Cada día, a las 00:15 de Bogotá, el Excel de los eventos del día anterior se
 * guarda en un bucket privado y se envía a los superadministradores. Aquí se
 * listan con su número de eventos y el estado del envío, y se descargan por
 * una URL firmada de cinco minutos que se pide al pulsar.
 *
 * Es una COPIA: el histórico completo sigue en «Eventos».
 */
const ESTADO: Readonly<
  Record<EstadoDelEnvioDelRespaldo, { readonly texto: string; readonly tono: TonoDeDistintivo }>
> = {
  enviado: { texto: 'Enviado', tono: 'exito' },
  error: { texto: 'Falló · se reintenta', tono: 'peligro' },
  sin_configurar: { texto: 'Correo sin configurar', tono: 'aviso' },
  pendiente: { texto: 'Pendiente', tono: 'neutro' },
};

export const RespaldosDiarios = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consulta = useRespaldosDiarios(copropiedadId);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const descargar = async (fecha: string): Promise<void> => {
    setDescargando(fecha);
    setFallo(null);
    try {
      const { url } = await pedirDescargaDeRespaldo(copropiedadId, fecha);
      window.location.assign(url);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo preparar la descarga');
    } finally {
      setDescargando(null);
    }
  };

  const columnas: readonly Columna<RespaldoDiario>[] = [
    {
      clave: 'fecha',
      titulo: 'Día',
      texto: (r) => r.fecha,
      celda: (r) => <span className="tabular-nums text-secundario">{r.fecha}</span>,
    },
    {
      clave: 'eventos',
      titulo: 'Eventos',
      alineacion: 'derecha',
      texto: (r) => String(r.numeroDeEventos),
      celda: (r) => (
        <span className="tabular-nums text-secundario">
          {r.numeroDeEventos}
          <span className="block text-texto-apagado">
            {r.permitidos} permitidos · {r.negados} negados
          </span>
        </span>
      ),
    },
    {
      clave: 'envio',
      titulo: 'Envío por correo',
      texto: (r) => ESTADO[r.estadoDelEnvio].texto,
      celda: (r) => (
        <span className="text-secundario">
          <Distintivo tono={ESTADO[r.estadoDelEnvio].tono}>
            {ESTADO[r.estadoDelEnvio].texto}
          </Distintivo>
          {r.ultimoError === null ? null : (
            <span className="mt-0.5 block text-texto-apagado">{r.ultimoError}</span>
          )}
        </span>
      ),
    },
    {
      clave: 'descarga',
      titulo: 'Fichero',
      celda: (r) => (
        <Boton
          variante="secundario"
          tamano="sm"
          disabled={descargando !== null}
          aria-label={`Descargar el respaldo del ${r.fecha}`}
          title={`SHA-256 ${r.sha256}`}
          onClick={() => void descargar(r.fecha)}
        >
          {descargando === r.fecha ? 'Preparando…' : 'Descargar'}
        </Boton>
      ),
    },
  ];

  if (consulta.isError) {
    return estadoSegunCodigo(
      consulta.error instanceof ErrorDeApi ? consulta.error : 0,
      consulta.error instanceof Error ? consulta.error.message : 'Error inesperado',
      () => void consulta.refetch(),
    );
  }

  return (
    <section aria-labelledby="titulo-respaldos" className="mt-6">
      <h2 id="titulo-respaldos" className="sr-only">
        Respaldos diarios
      </h2>
      {fallo === null ? null : (
        <p role="alert" className="mb-2 text-secundario text-peligro-texto">
          {fallo}
        </p>
      )}
      <TablaDeDatos
        titulo="Respaldos diarios"
        columnas={columnas}
        filas={consulta.data ?? []}
        cargando={consulta.isLoading}
        claveDeFila={(r) => r.fecha}
        porPagina={10}
        vacio={{
          titulo: 'Aún no hay respaldos',
          descripcion:
            'Cada día a las 00:15 (hora de Bogotá) se guarda el Excel de los eventos del día anterior y se envía a la superadministración. El histórico completo sigue en «Eventos».',
        }}
      />
    </section>
  );
};
