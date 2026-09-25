'use client';

import type { JSX } from 'react';
import { useMemo } from 'react';
import { create as crearQr } from 'qrcode';
import { TEMA_CLARO } from '@ncr/config';

/**
 * A3 (15-E) · EL ENLACE DEL TITULAR, TAMBIÉN COMO QR.
 *
 * El SMTP está bloqueado (BE-01) y el enlace no puede depender del correo: el
 * operador lo enseña en pantalla y el visitante lo lee con la cámara de su
 * teléfono. Se pinta como SVG con `<rect>` por módulo —sin `canvas`, sin HTML
 * inyectado— para que la CSP no tenga nada que objetar y para que la prueba
 * pueda contar módulos sin un navegador de verdad.
 *
 * Papel blanco y tinta negra EN LOS DOS TEMAS, y con cuatro módulos de zona de
 * silencio: es un requisito del formato, no un color de pantalla (los lectores
 * fallan sobre fondo oscuro). Los dos colores salen de `constante` del preset,
 * la única pareja declarada que no cambia con el tema; no hay literal suelto.
 */
const { blanco, negro } = TEMA_CLARO.constante;
const SILENCIO = 4;
export const CodigoQr = ({
  texto,
  titulo,
  className,
}: {
  readonly texto: string;
  readonly titulo: string;
  readonly className?: string;
}): JSX.Element => {
  const qr = useMemo(() => crearQr(texto, { errorCorrectionLevel: 'M' }), [texto]);
  const n = qr.modules.size;
  const modulos: JSX.Element[] = [];
  for (let fila = 0; fila < n; fila += 1) {
    for (let columna = 0; columna < n; columna += 1) {
      if (qr.modules.get(fila, columna) === 1) {
        modulos.push(
          <rect
            key={`${String(fila)}-${String(columna)}`}
            x={columna}
            y={fila}
            width={1}
            height={1}
          />,
        );
      }
    }
  }
  const lado = n + SILENCIO * 2;
  return (
    <svg
      role="img"
      aria-label={titulo}
      viewBox={`${String(-SILENCIO)} ${String(-SILENCIO)} ${String(lado)} ${String(lado)}`}
      shapeRendering="crispEdges"
      className={className ?? 'h-44 w-44 rounded-md'}
      data-modulos={n}
    >
      <rect x={-SILENCIO} y={-SILENCIO} width={lado} height={lado} fill={blanco} />
      <g fill={negro}>{modulos}</g>
    </svg>
  );
};
