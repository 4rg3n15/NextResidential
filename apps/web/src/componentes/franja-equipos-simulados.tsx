import type { JSX } from 'react';
import { Unplug } from 'lucide-react';

/**
 * F3 (corrección de la 15-L) · franja FIJA mientras la API opere con equipos
 * simulados y haya equipos reales dados de alta: ninguna apertura, foto ni
 * llamada de la consola llega a un aparato. Fija y no descartable, como la del
 * modo pruebas: es un estado de la plataforma, no un aviso que se lee una vez.
 * El texto lo da la API; es el mismo que dicen la bitácora y el ensayo.
 */
export const FranjaDeEquiposSimulados = ({ texto }: { readonly texto: string }): JSX.Element => (
  <div
    role="status"
    className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-peligro bg-peligro-suave px-4 py-2 text-center text-secundario font-medium text-peligro-texto"
  >
    <Unplug className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={2} />
    {texto}
  </div>
);
