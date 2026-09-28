import type { JSX } from 'react';
import { FlaskConical } from 'lucide-react';

/** El texto exacto que pidió el cliente (H5): se prueba literal. */
export const TEXTO_MODO_PRUEBAS = 'Modo pruebas activo: restricciones de porteros desactivadas';

/**
 * H5 (15-L) · franja FIJA arriba de toda la consola mientras el modo pruebas
 * esté activo. Fija y no descartable: es un estado de seguridad de toda la
 * plataforma, no un aviso que se lee una vez.
 */
export const FranjaDeModoPruebas = (): JSX.Element => (
  <div
    role="status"
    className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-aviso bg-aviso-suave px-4 py-2 text-center text-secundario font-medium text-aviso-texto"
  >
    <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={2} />
    {TEXTO_MODO_PRUEBAS}
  </div>
);
