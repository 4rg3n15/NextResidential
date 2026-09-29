'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { EstadoVacio } from '@/componentes/estados';
import { Boton } from '@/componentes/ui/boton';
import { CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import {
  clavesDelResidente,
  useMiVivienda,
  useMisAutorizaciones,
  useMisUltimosVisitantes,
} from '@/lib/api/residente';
import type { VisitanteReciente } from '@/lib/api/residente';
import { fechaCorta } from '@/lib/fechas';
import { Aviso, FilaDeAutorizacion, Seccion, estadoDeConsulta } from '../comunes';
import { NuevaVisita } from './nueva-visita';
import { VolverAAutorizar } from './volver-a-autorizar';

const Reciente = ({
  v,
  alVolver,
}: {
  readonly v: VisitanteReciente;
  readonly alVolver: (v: VisitanteReciente) => void;
}): JSX.Element => (
  <Tarjeta>
    <CuerpoDeTarjeta className="space-y-1 pt-4">
      <p className="font-medium text-texto">{v.visitante}</p>
      <p className="text-secundario text-texto-apagado">
        {[`Documento ${v.documento}`, v.placa, `última visita ${fechaCorta(v.ultimaVisita)}`]
          .filter((x): x is string => x !== null)
          .join(' · ')}
      </p>
      {!v.tieneFoto ? (
        <p className="text-secundario text-texto-apagado">
          No hay una foto guardada: regístralo como visitante nuevo.
        </p>
      ) : null}
      <div className="flex justify-end">
        <Boton
          variante="secundario"
          tamano="sm"
          disabled={!v.tieneFoto}
          onClick={() => alVolver(v)}
        >
          Volver a autorizar
        </Boton>
      </div>
    </CuerpoDeTarjeta>
  </Tarjeta>
);

/**
 * M-4 · «Visitas»: registrar un visitante nuevo, volver a autorizar a uno que
 * vuelve y ver lo que el conjunto tiene registrado a tu nombre con su
 * situación. Si puedes autorizar lo dice el servidor (`puedeAutorizar`).
 *
 * [SUPUESTO] S-153 · con `puedeAutorizar` en falso el botón se ve deshabilitado
 * y se explica por qué, en vez de ocultarlo: el residente sabe que existe y qué
 * le falta. El servidor lo rechaza igual si se intentara (RN-05, RN-13).
 */
export const PantallaDeMisVisitas = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const hogar = useMiVivienda(copropiedadId);
  const autorizaciones = useMisAutorizaciones(copropiedadId);
  const ultimos = useMisUltimosVisitantes(copropiedadId);
  const [nueva, setNueva] = useState(false);
  const [volver, setVolver] = useState<VisitanteReciente | null>(null);

  const puedeAutorizar = hogar.data?.puedeAutorizar ?? false;
  const lista = autorizaciones.data ?? [];
  const recientes = ultimos.data ?? [];

  const refrescar = (): void => {
    void consultas.invalidateQueries({ queryKey: clavesDelResidente.raiz(copropiedadId) });
  };

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Visitas"
        descripcion="Autoriza a tus visitantes con su foto: la portería los ve al instante y la entrada los reconoce."
        acciones={
          <Boton disabled={!puedeAutorizar} onClick={() => setNueva(true)}>
            Nuevo visitante
          </Boton>
        }
      />
      {hogar.data !== undefined && !puedeAutorizar ? (
        <Aviso tono="aviso">
          {hogar.data.vivienda.activa
            ? 'Hoy sólo el titular de la vivienda puede autorizar visitantes.'
            : 'Tu vivienda está inactiva: las autorizaciones vigentes siguen valiendo y no se pueden crear nuevas.'}
        </Aviso>
      ) : null}

      {recientes.length > 0 || ultimos.isError ? (
        <Seccion
          titulo="Últimos visitantes"
          descripcion="Para quien vuelve: se usan de nuevo sus datos y su foto."
        >
          {estadoDeConsulta(ultimos, 'Cargando tus últimos visitantes')}
          <div className="grid gap-3 md:grid-cols-2">
            {recientes.map((v) => (
              <Reciente key={v.autorizacionId} v={v} alVolver={setVolver} />
            ))}
          </div>
        </Seccion>
      ) : null}

      <Seccion
        titulo="Autorizaciones"
        descripcion="Lo que el conjunto ya tiene registrado a tu nombre."
      >
        {estadoDeConsulta(autorizaciones, 'Cargando tus autorizaciones')}
        {autorizaciones.data !== undefined && lista.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no has autorizado a ningún visitante"
            descripcion="Cuando registres una visita aparecerá aquí con su estado."
          />
        ) : null}
        {lista.length > 0 ? (
          <Tarjeta>
            <ul className="px-5" aria-label="Mis autorizaciones">
              {lista.map((a) => (
                <FilaDeAutorizacion key={a.id} a={a} />
              ))}
            </ul>
          </Tarjeta>
        ) : null}
      </Seccion>

      <NuevaVisita
        copropiedadId={copropiedadId}
        abierto={nueva}
        alCerrar={() => setNueva(false)}
        alRegistrar={refrescar}
      />
      <VolverAAutorizar
        copropiedadId={copropiedadId}
        visitante={volver}
        alCerrar={() => setVolver(null)}
        alRegistrar={refrescar}
      />
    </div>
  );
};
