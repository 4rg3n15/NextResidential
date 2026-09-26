'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PlazaDeOcupante } from '@ncr/contracts';
import { useViviendas } from '@/lib/api/consultas';
import { cliente, desenvolver } from '@/lib/api/cliente';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo } from '@/componentes/ui/distintivo';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { clavesDeResidentes, useOcupantes } from './consultas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * OCUPANTES DE UNA VIVIENDA · D6 (3.3)
 *
 * El primer residente declara el número UNA vez desde la app y es definitivo.
 * Añadir o quitar ocupantes después lo hace el superadministrador AQUÍ, a
 * petición del residente, siempre con motivo —queda en la bitácora de
 * residentes—. Quitar una plaza ocupada da de baja el vínculo de esa persona.
 * Los códigos de las plazas libres se muestran para poder dárselos.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const OcupantesPorVivienda = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const viviendas = useViviendas(copropiedadId, { estado: 'activo', busqueda: '' });
  const [viviendaId, setViviendaId] = useState('');
  const plazas = useOcupantes(copropiedadId, viviendaId);
  const [anadir, setAnadir] = useState(false);
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [retirar, setRetirar] = useState<PlazaDeOcupante | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  const refrescar = () =>
    consultas.invalidateQueries({
      queryKey: clavesDeResidentes.ocupantes(copropiedadId, viviendaId),
    });

  const hacer = async (trabajo: () => Promise<unknown>, alTerminar: () => void): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      await trabajo();
      await refrescar();
      alTerminar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.');
    } finally {
      setEnviando(false);
    }
  };

  const lista = plazas.data ?? [];
  return (
    <section className="space-y-3 rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-titulo font-semibold text-texto">Ocupantes por vivienda</h2>
          <p className="text-secundario text-texto-apagado">
            El número lo fija el primer residente y es definitivo; aquí se añaden o quitan a
            petición suya.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="space-y-1.5">
            <span className="block text-secundario font-medium text-texto">Vivienda</span>
            <select
              aria-label="Vivienda"
              value={viviendaId}
              onChange={(e) => setViviendaId(e.target.value)}
              className="h-11 min-w-48 rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto"
            >
              <option value="">Elija una vivienda</option>
              {(viviendas.data?.viviendas ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.agrupacion === null ? v.identificador : `${v.agrupacion} · ${v.identificador}`}
                </option>
              ))}
            </select>
          </label>
          <Boton disabled={viviendaId === ''} onClick={() => setAnadir(true)}>
            Añadir ocupantes
          </Boton>
        </div>
      </header>
      {viviendaId === '' ? null : lista.length === 0 && plazas.isSuccess ? (
        <p className="text-secundario text-texto-apagado">
          Sin ocupantes declarados. El primer residente los declara desde la app.
        </p>
      ) : (
        <ul className="divide-y divide-borde" aria-label="Plazas de ocupante">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-cuerpo text-texto">
                Ocupante {p.numero}:{' '}
                {p.libre ? (
                  <Distintivo tono="neutro">Libre · código {p.codigo}</Distintivo>
                ) : (
                  <strong>{p.ocupante}</strong>
                )}
              </span>
              <Boton variante="fantasma" tamano="sm" onClick={() => setRetirar(p)}>
                Quitar
              </Boton>
            </li>
          ))}
        </ul>
      )}
      <DialogoDeFormulario
        abierto={anadir}
        titulo="Añadir ocupantes"
        descripcion="Cada ocupante nuevo tiene su código para vincular su cuenta desde la app. Queda en la bitácora con su motivo."
        etiquetaEnviar="Añadir"
        enviando={enviando}
        error={error}
        puedeEnviar={/^([1-9]|10)$/.test(cantidad) && motivo.trim().length >= 3}
        alEnviar={() =>
          void hacer(
            async () =>
              desenvolver(
                await cliente.POST('/copropiedades/{id}/viviendas/{viviendaId}/ocupantes', {
                  params: { path: { id: copropiedadId, viviendaId } },
                  body: { cantidad: Number(cantidad), motivo: motivo.trim() },
                }),
              ),
            () => {
              setAnadir(false);
              setMotivo('');
            },
          )
        }
        alCancelar={() => setAnadir(false)}
      >
        <div className="space-y-3">
          <Campo
            etiqueta="Cuántos"
            name="cantidad"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
          <Campo
            etiqueta="Motivo (lo pidió el residente)"
            name="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
      </DialogoDeFormulario>
      <DialogoDeConfirmacion
        abierto={retirar !== null}
        titulo={`Quitar el ocupante ${String(retirar?.numero ?? '')}`}
        descripcion={
          retirar?.libre === false
            ? `La plaza la ocupa ${retirar.ocupante ?? ''}: su vínculo con la vivienda se da de baja.`
            : 'La plaza está libre: su código deja de valer.'
        }
        etiquetaConfirmar="Quitar"
        enviando={enviando}
        error={error}
        alConfirmar={(m) =>
          void hacer(
            async () =>
              retirar === null
                ? undefined
                : desenvolver(
                    await cliente.POST(
                      '/copropiedades/{id}/viviendas/{viviendaId}/ocupantes/{plazaId}/retiro',
                      {
                        params: { path: { id: copropiedadId, viviendaId, plazaId: retirar.id } },
                        body: { motivo: m },
                      },
                    ),
                  ),
            () => setRetirar(null),
          )
        }
        alCancelar={() => setRetirar(null)}
      />
    </section>
  );
};
