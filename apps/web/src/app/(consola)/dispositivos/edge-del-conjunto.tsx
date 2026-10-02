'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Esquemas } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

type FichaDeEdge = Esquemas['FichaDeEdgeDto'];

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · A3 · EL EDGE DEL CONJUNTO, EN LA PANTALLA DE DISPOSITIVOS
 *
 * Con el Edge como puente (ADR-035), los equipos de esta copropiedad se operan
 * por su túnel: si el Edge está desconectado, ninguna orden de esta pantalla
 * llega a un equipo. Por eso se dice ARRIBA, con fecha: «conectado desde…» o
 * «desconectado desde…». Una copropiedad sin Edge no ve nada nuevo (R1).
 *
 * Al superadministrador, dos acciones: marcar (o desmarcar) el puente, y mudar
 * al Edge las credenciales que aún están en la nube (D3) —la nube las borra
 * SÓLO cuando el Edge confirma que con ellas el equipo autentica—.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const fechaYHora = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

export const estadoDelEdge = (
  e: FichaDeEdge,
): { readonly tono: 'exito' | 'peligro' | 'neutro'; readonly texto: string } => {
  const desde = e.conexionDesde ?? null;
  if (e.conectado) {
    return {
      tono: 'exito',
      texto: desde === null ? 'Conectado' : `Conectado desde ${fechaYHora(desde)}`,
    };
  }
  return desde === null
    ? { tono: 'neutro', texto: 'Nunca se ha conectado' }
    : { tono: 'peligro', texto: `Desconectado desde ${fechaYHora(desde)}` };
};

export const EdgeDelConjunto = ({
  copropiedadId,
  esSuperadmin,
}: {
  readonly copropiedadId: string;
  readonly esSuperadmin: boolean;
}): JSX.Element | null => {
  const clientes = useQueryClient();
  const clave = ['edge-gateways', copropiedadId] as const;
  const consulta = useQuery({
    queryKey: clave,
    // Un rol que no la puede leer, o una API anterior: sin panel, como antes.
    queryFn: async (): Promise<FichaDeEdge[]> => {
      try {
        return desenvolver(
          await cliente.GET('/copropiedades/{id}/edge-gateways', {
            params: { path: { id: copropiedadId } },
          }),
        );
      } catch {
        return [];
      }
    },
    refetchInterval: 15_000,
  });
  const [aviso, setAviso] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const edges = consulta.data ?? [];
  if (edges.length === 0) return null;

  const hacer = async (edgeId: string, accion: () => Promise<string>): Promise<void> => {
    setEnCurso(edgeId);
    setAviso(null);
    try {
      setAviso(await accion());
      await clientes.invalidateQueries({ queryKey: clave });
    } catch (error) {
      setAviso(error instanceof ErrorDeApi ? error.message : 'No se pudo completar la acción');
    } finally {
      setEnCurso(null);
    }
  };
  const marcar = (e: FichaDeEdge) =>
    hacer(e.id, async () => {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/edge-gateways/{edgeId}/puente', {
          params: { path: { id: copropiedadId, edgeId: e.id } },
          body: { puente: !e.puente },
        }),
      );
      return e.puente
        ? `${e.nombre} deja de ser el puente: la API vuelve a hablar directo con los equipos`
        : `${e.nombre} es ahora el puente de los equipos del conjunto`;
    });
  const migrar = (e: FichaDeEdge) =>
    hacer(e.id, async () => {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/edge-gateways/{edgeId}/migrar-credenciales', {
          params: { path: { id: copropiedadId, edgeId: e.id } },
        }),
      );
      const movidas = r.filter((t) => t.trasladada).length;
      const pendientes = r.filter((t) => !t.trasladada);
      return pendientes.length === 0
        ? `${String(movidas)} credencial(es) mudadas al Edge y borradas de la nube`
        : `${String(movidas)} mudada(s); ${String(pendientes.length)} siguen en la nube: ` +
            pendientes.map((t) => t.motivo).join(' · ');
    });

  return (
    <section aria-label="Edge del conjunto" className="mb-4 rounded-md border border-borde p-3">
      <h2 className="mb-2 text-secundario font-semibold">Edge del conjunto</h2>
      <ul className="flex flex-col gap-2">
        {edges.map((e) => {
          const estado = estadoDelEdge(e);
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{e.nombre}</span>
              <Distintivo tono={estado.tono}>{estado.texto}</Distintivo>
              {e.puente ? <Distintivo tono="marca">Puente de los equipos</Distintivo> : null}
              {e.puente && !e.conectado ? (
                <span className="text-secundario text-peligro-texto">
                  Las órdenes a los equipos fallan hasta que el Edge vuelva.
                </span>
              ) : null}
              {esSuperadmin ? (
                <span className="ml-auto flex gap-2">
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    disabled={enCurso !== null}
                    onClick={() => void marcar(e)}
                  >
                    {e.puente ? 'Quitar puente' : 'Usar como puente'}
                  </Boton>
                  {e.puente ? (
                    <Boton
                      tamano="sm"
                      disabled={enCurso !== null || !e.conectado}
                      title={e.conectado ? undefined : 'El Edge tiene que estar conectado'}
                      onClick={() => void migrar(e)}
                    >
                      Mudar credenciales al Edge
                    </Boton>
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {aviso === null ? null : (
        <p role="status" className="mt-2 text-secundario text-texto-apagado">
          {aviso}
        </p>
      )}
    </section>
  );
};
