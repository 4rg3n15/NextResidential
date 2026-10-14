'use client';

import type { JSX } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { compartirTexto } from '@/lib/compartir';
import type { ResultadoDeCompartir } from '@/lib/compartir';

/**
 * 15-Y2 · «Compartir» un código: la hoja del sistema (Web Share, la de Safari
 * en el iPhone) y, si no la hay, el portapapeles. El botón no pinta el aviso:
 * se lo entrega a quien lo monta, que lo pone en su región `role="status"`
 * para que un lector de pantalla lo anuncie donde ya está mirando.
 */
export const mensajeDeCompartir = (
  resultado: ResultadoDeCompartir,
  codigo: string,
): string | null => {
  switch (resultado) {
    case 'compartido':
      return 'Código compartido.';
    case 'copiado':
      return 'Mensaje con el código copiado. Péguelo en un chat o en un mensaje de texto para quien vive con usted.';
    case 'sin_medio':
      return `No se pudo copiar. Copie el código a mano: ${codigo}`;
    case 'cancelado':
      return null;
  }
};

export const BotonCompartir = ({
  texto,
  codigo,
  etiqueta = 'Compartir',
  alResultado,
}: {
  /** El mensaje completo que se comparte. */
  readonly texto: string;
  /** El código solo, para el aviso de último recurso. */
  readonly codigo: string;
  readonly etiqueta?: string;
  readonly alResultado: (mensaje: string | null) => void;
}): JSX.Element => (
  <Boton
    type="button"
    variante="secundario"
    tamano="sm"
    aria-label={`${etiqueta} el código ${codigo}`}
    onClick={() =>
      void compartirTexto(texto).then((r) => alResultado(mensajeDeCompartir(r, codigo)))
    }
  >
    {etiqueta}
  </Boton>
);
