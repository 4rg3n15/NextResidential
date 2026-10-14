'use client';

import type { JSX } from 'react';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import type { EstadoDeMiRostro } from '@/lib/api/residente';
import { fechaCorta } from '@/lib/fechas';
import { textoDelEquipo, textoDelEstado } from '@/lib/rostro';

/** 15-Y3 · el estado del rostro y sus equipos, con las frases de la app. Nunca la imagen. */
export const TarjetaDelEstado = ({
  estado,
}: {
  readonly estado: EstadoDeMiRostro;
}): JSX.Element => {
  const e = estado;
  return (
    <Tarjeta>
      <CabeceraDeTarjeta
        titulo={textoDelEstado(e)}
        {...(e.registradoEn !== null && e.venceEn !== null
          ? {
              descripcion: `Registrado el ${fechaCorta(e.registradoEn)} · vence el ${fechaCorta(e.venceEn)}`,
            }
          : {})}
      />
      {e.equipos.length > 0 ? (
        <CuerpoDeTarjeta>
          <ul aria-label="Equipos de la portería">
            {e.equipos.map((q) => (
              <li
                key={q.nombre}
                className="flex items-center justify-between gap-3 border-b border-borde-suave py-2 last:border-b-0"
              >
                <span className="text-cuerpo text-texto">{q.nombre}</span>
                <Distintivo
                  tono={
                    q.estado === 'sincronizada'
                      ? 'exito'
                      : q.estado === 'fallida'
                        ? 'aviso'
                        : 'neutro'
                  }
                >
                  {textoDelEquipo(q.estado)}
                </Distintivo>
              </li>
            ))}
          </ul>
        </CuerpoDeTarjeta>
      ) : null}
    </Tarjeta>
  );
};
