'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AlertaExpuesta } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useAlertasAbiertas } from '@/lib/api/consultas';
import type { FiltroDeAlertas } from '@/lib/api/consultas';
import { fechaYHora } from '@/lib/fechas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E5 / C7 (ETAPA 15-M) · LA COLA DE ALERTAS, CON ARCHIVO Y FILTROS
 *
 * En sitio la cola se llenó de una alerta por lectura de la cámara sin
 * atestación y el operador dejó de mirarla. Ahora la API abre UNA por
 * condición, y lo que ya es ruido se ARCHIVA: individual o en lote, con motivo
 * obligatorio; nunca se borra (RN-19), y la auditoría guarda quién y cuándo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SEVERIDAD: Readonly<Record<string, { tono: TonoDeDistintivo; texto: string }>> = {
  critica: { tono: 'peligro', texto: 'Crítica' },
  alta: { tono: 'peligro', texto: 'Alta' },
  media: { tono: 'aviso', texto: 'Media' },
  informativa: { tono: 'neutro', texto: 'Informativa' },
};

export const MINIMO_MOTIVO_DE_ARCHIVO = 3;

export const AlertasAbiertas = ({
  copropiedadId,
  nombreDe,
  equipos,
}: {
  readonly copropiedadId: string;
  readonly nombreDe: (dispositivoId: string) => string;
  readonly equipos: readonly { readonly id: string; readonly nombre: string }[];
}): JSX.Element => {
  const clientes = useQueryClient();
  const [filtro, setFiltro] = useState<FiltroDeAlertas>({});
  const alertas = useAlertasAbiertas(copropiedadId, filtro);
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [motivo, setMotivo] = useState('');
  const [enCurso, setEnCurso] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lista = alertas.data ?? [];
  /** Nombre accesible único por fila: tipo, equipo y hora. */
  const descripcionDe = (a: AlertaExpuesta): string =>
    `${a.tipo.replace(/_/g, ' ')}${a.dispositivoId === null ? '' : ` de ${nombreDe(a.dispositivoId)}`} del ${fechaYHora(a.generadaEn)}`;
  const puedeArchivar = motivo.trim().length >= MINIMO_MOTIVO_DE_ARCHIVO && !enCurso;

  const archivar = async (ids: readonly string[]): Promise<void> => {
    setEnCurso(true);
    setError(null);
    try {
      const r =
        ids.length === 1 && ids[0] !== undefined
          ? desenvolver(
              await cliente.POST('/copropiedades/{id}/alertas/{alertaId}/archivar', {
                params: { path: { id: copropiedadId, alertaId: ids[0] } },
                body: { motivo: motivo.trim() },
              }),
            )
          : desenvolver(
              await cliente.POST('/copropiedades/{id}/alertas/archivar', {
                params: { path: { id: copropiedadId } },
                body: { ids: [...ids], motivo: motivo.trim() },
              }),
            );
      setAviso(
        `${String(r.archivadas)} alerta(s) archivada(s) con motivo; ninguna se borra.` +
          (r.omitidas > 0 ? ` ${String(r.omitidas)} ya estaba(n) archivada(s).` : ''),
      );
      setMarcadas(new Set());
      await clientes.invalidateQueries({ queryKey: ['alertas', copropiedadId] });
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo archivar');
    } finally {
      setEnCurso(false);
    }
  };

  const alternar = (id: string): void => {
    const siguiente = new Set(marcadas);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    setMarcadas(siguiente);
  };

  return (
    <section className="mb-4 rounded-tarjeta border border-borde bg-lienzo px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-cuerpo font-semibold text-texto">
          Alertas abiertas{alertas.data === undefined ? '' : ` · ${String(lista.length)}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-secundario">
            <span className="text-texto-apagado">Equipo</span>
            <select
              value={filtro.dispositivoId ?? ''}
              onChange={(e) => setFiltro({ ...filtro, dispositivoId: e.target.value || undefined })}
              aria-label="Filtrar alertas por equipo"
              className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
            >
              <option value="">Todos</option>
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-secundario">
            <span className="text-texto-apagado">Severidad</span>
            <select
              value={filtro.severidad ?? ''}
              onChange={(e) =>
                setFiltro({
                  ...filtro,
                  severidad: (e.target.value || undefined) as FiltroDeAlertas['severidad'],
                })
              }
              aria-label="Filtrar alertas por severidad"
              className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
            >
              <option value="">Todas</option>
              {Object.entries(SEVERIDAD).map(([valor, s]) => (
                <option key={valor} value={valor}>
                  {s.texto}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="mt-2 text-secundario text-texto-apagado">
          {alertas.isLoading ? 'Cargando alertas…' : 'Sin alertas abiertas con estos filtros.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {lista.map((a: AlertaExpuesta) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 text-secundario">
              <input
                type="checkbox"
                checked={marcadas.has(a.id)}
                onChange={() => alternar(a.id)}
                aria-label={`Marcar la alerta ${descripcionDe(a)}`}
              />
              <Distintivo tono={SEVERIDAD[a.severidad]?.tono ?? 'neutro'}>
                {SEVERIDAD[a.severidad]?.texto ?? a.severidad}
              </Distintivo>
              <span className="text-texto">{a.tipo.replace(/_/g, ' ')}</span>
              <span className="text-texto-apagado">
                {a.dispositivoId === null ? '' : `${nombreDe(a.dispositivoId)} · `}
                {fechaYHora(a.generadaEn)}
              </span>
              {a.notas === null ? null : (
                <span className="text-texto-apagado" title={a.notas}>
                  {a.notas.length > 90 ? `${a.notas.slice(0, 90)}…` : a.notas}
                </span>
              )}
              <Boton
                tamano="sm"
                variante="secundario"
                disabled={!puedeArchivar}
                onClick={() => void archivar([a.id])}
                aria-label={`Archivar la alerta ${descripcionDe(a)}`}
              >
                Archivar
              </Boton>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex flex-1 items-center gap-2 text-secundario">
          <span className="text-texto-apagado">Motivo del archivo</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            placeholder="Obligatorio: queda en la auditoría con quién y cuándo"
            className="flex-1 rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
          />
        </label>
        <Boton
          tamano="sm"
          variante="secundario"
          disabled={!puedeArchivar || marcadas.size === 0}
          onClick={() => void archivar([...marcadas])}
        >
          Archivar {marcadas.size > 0 ? `${String(marcadas.size)} marcada(s)` : 'marcadas'}
        </Boton>
      </div>
      {aviso !== null ? (
        <p role="status" className="mt-2 text-secundario text-texto-apagado">
          {aviso}
        </p>
      ) : null}
      {error !== null ? (
        <p role="alert" className="mt-2 text-secundario text-peligro-texto">
          {error}
        </p>
      ) : null}
    </section>
  );
};
