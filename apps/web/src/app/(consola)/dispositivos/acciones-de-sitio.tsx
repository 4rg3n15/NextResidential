'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { Equipo, ResultadoDeConfiguracion } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS ACCIONES DEL DÍA DE ENTREGA, EN LA FICHA · corrección de la 15-L
 *
 *  · Cámara · «Enviar eventos a este Mac» (C2): la IP del Mac cambia de la
 *    casa al sitio; esto reescribe el servidor de alarmas de la cámara con la
 *    IP de ahora y lo confirma leyéndolo de vuelta.
 *  · Terminal · «Verificación remota: activar / desactivar» (F2): el plan B
 *    sin código si la terminal no recibe el veredicto a tiempo.
 *
 * Las dos piden el mismo motivo que las correcciones: queda en la auditoría
 * con el valor anterior y el nuevo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const textoDelResultado = (r: ResultadoDeConfiguracion): string =>
  r.aplicada
    ? `${r.detalle}. Antes: ${r.valorAnterior ?? '(sin valor)'} → ahora: ${r.valorNuevo ?? '(sin cambio)'}. Queda constancia de quién y cuándo.`
    : r.detalle;

/** E4 (15-M) · los tipos que pueden publicar en un servidor de alarmas. */
const PUBLICAN: ReadonlySet<string> = new Set(['camara_lpr', 'terminal_facial', 'intercom']);

export const AccionesDeSitio = ({
  copropiedadId,
  equipo,
  motivo,
  alTerminar,
  alFallar,
}: {
  readonly copropiedadId: string;
  readonly equipo: Equipo;
  /** Ya recortado; `null` si no alcanza el mínimo y las acciones no se ofrecen. */
  readonly motivo: string | null;
  readonly alTerminar: (aviso: string) => void;
  readonly alFallar: (mensaje: string) => void;
}): JSX.Element | null => {
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const ruta = { params: { path: { id: copropiedadId, equipoId: equipo.id } } };

  const ejecutar = async (
    cual: string,
    peticion: () => Promise<ResultadoDeConfiguracion>,
  ): Promise<void> => {
    setEnCurso(cual);
    try {
      alTerminar(textoDelResultado(await peticion()));
    } catch (e) {
      alFallar(e instanceof ErrorDeApi ? e.message : 'El equipo no aceptó el cambio');
    } finally {
      setEnCurso(null);
    }
  };

  if (
    equipo.tipo !== 'camara_lpr' &&
    equipo.tipo !== 'terminal_facial' &&
    equipo.tipo !== 'intercom'
  ) {
    return null;
  }
  const deshabilitado = motivo === null || enCurso !== null;
  // E4 (15-M) · la terminal y el videoportero los ESCUCHA la plataforma: el
  // receptor («HTTP listening») que traen del sitio es un resto y se apaga.
  const escuchado = equipo.tipo === 'terminal_facial' || equipo.tipo === 'intercom';

  return (
    <div className="space-y-2 rounded-md border border-borde px-3 py-3">
      <p className="text-etiqueta font-medium text-texto">
        {equipo.tipo === 'camara_lpr' ? 'Eventos de la cámara' : 'Eventos del equipo'}
      </p>
      <p className="text-secundario text-texto-apagado">
        {equipo.tipo === 'camara_lpr'
          ? 'Si el Mac cambió de red, la cámara sigue enviando a la IP de antes. Esto le escribe la IP de ahora y lo comprueba leyéndolo de vuelta.'
          : 'Este equipo no necesita publicar: la plataforma lo escucha por su flujo. Si su ficha muestra un receptor huérfano (un «HTTP listening» a una dirección que ya no existe), apáguelo aquí; «Enviar eventos a este Mac» sólo si en sitio la escucha no basta.'}
        {motivo === null ? ' Escriba antes el motivo.' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {escuchado ? (
          <Boton
            type="button"
            tamano="sm"
            variante="secundario"
            disabled={deshabilitado}
            onClick={() =>
              void ejecutar('receptor', async () =>
                desenvolver(
                  await cliente.POST('/copropiedades/{id}/equipos/{equipoId}/desactivar-receptor', {
                    ...ruta,
                    body: { motivo: motivo ?? '' },
                  }),
                ),
              )
            }
          >
            {enCurso === 'receptor' ? 'Apagando…' : 'Desactivar el receptor huérfano'}
          </Boton>
        ) : null}
        {/* E4 (15-M) · para TODO equipo que publica: la cámara siempre; la
            terminal y el videoportero sólo si en sitio la escucha no basta. */}
        {PUBLICAN.has(equipo.tipo) ? (
          <Boton
            type="button"
            tamano="sm"
            variante="secundario"
            disabled={deshabilitado}
            onClick={() =>
              void ejecutar('eventos', async () =>
                desenvolver(
                  await cliente.POST(
                    '/copropiedades/{id}/equipos/{equipoId}/enviar-eventos-a-este-mac',
                    { ...ruta, body: { motivo: motivo ?? '' } },
                  ),
                ),
              )
            }
          >
            {enCurso === 'eventos' ? 'Enviando…' : 'Enviar eventos a este Mac'}
          </Boton>
        ) : null}
      </div>
      {equipo.tipo === 'terminal_facial' ? (
        <>
          <p className="text-etiqueta font-medium text-texto">Verificación remota</p>
          <p className="text-secundario text-texto-apagado">
            Desactivarla es el plan B si la terminal no recibe a tiempo la respuesta de la
            plataforma: vuelve a abrir con su propio reconocimiento y la plataforma deja de decidir.
          </p>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {equipo.tipo === 'terminal_facial'
          ? [true, false].map((activar) => (
              <Boton
                key={String(activar)}
                type="button"
                tamano="sm"
                variante={activar ? 'secundario' : 'peligro'}
                disabled={deshabilitado}
                onClick={() =>
                  void ejecutar(String(activar), async () =>
                    desenvolver(
                      await cliente.PUT(
                        '/copropiedades/{id}/equipos/{equipoId}/verificacion-remota',
                        {
                          ...ruta,
                          body: { activar, motivo: motivo ?? '' },
                        },
                      ),
                    ),
                  )
                }
              >
                {activar ? 'Verificación remota: activar' : 'Verificación remota: desactivar'}
              </Boton>
            ))
          : null}
      </div>
    </div>
  );
};
