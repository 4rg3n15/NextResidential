import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { PantallaDeLatencias } from './pantalla';

export const metadata: Metadata = { title: 'Latencias comprometidas' };
export const dynamic = 'force-dynamic';

/**
 * W-11 · Latencias comprometidas (RNF-11.3, ETAPA 14).
 *
 * **No pide copropiedad activa, y es la única pantalla de la consola que no la
 * pide.** No hay ninguna que pedir: son tiempos agregados del proceso, sin
 * identificadores, sin placas y sin personas. La API lo declara igual —la ruta
 * no lleva `:id` y va marcada `@SinRecursoDeTenant()`—, así que exigir un
 * alcance aquí dejaría la pantalla en blanco para un superadministrador que no
 * pertenece a ninguna copropiedad, que es justo quien más la necesita.
 */
const Observabilidad = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const permitidos = ['administrador', 'superadministrador', 'operador_central'];
  if (!permitidos.includes(sesion.rol)) {
    return (
      <EstadoSinPermiso descripcion="El tablero de latencias es información de operación: solo lo ven los roles administrativos y la central." />
    );
  }
  return <PantallaDeLatencias />;
};

export default Observabilidad;
