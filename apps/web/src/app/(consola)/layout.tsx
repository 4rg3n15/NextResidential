import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import type { Rol } from '@ncr/contracts';
import { sesionActual } from '@/lib/sesion/servidor';
import { MarcoDeConsola } from '@/componentes/marco-consola';
import { ProveedorDeConsultas } from '@/lib/api/proveedor';
import { configuracion } from '@/lib/configuracion';

export const dynamic = 'force-dynamic';

/**
 * Marco de la consola. La sesión se resuelve **en el servidor y antes de pintar
 * nada**: un componente de cliente que redirige tras montarse enseña el
 * esqueleto de la consola a quien no ha entrado, y ese vistazo ya revela la
 * estructura del sistema.
 */
const LayoutDeConsola = async ({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');

  return (
    <ProveedorDeConsultas>
      <MarcoDeConsola sesion={sesion} rol={sesion.rol as Rol}>
        {/*
          DESVIACIÓN DECLARADA, VISIBLE EN PANTALLA. Un interruptor de seguridad
          que solo se ve en un fichero `.env` se queda puesto: nadie lee el
          entorno de un despliegue que funciona. Aquí lo ve quien usa la
          consola, en cada pantalla, hasta que se quite.
        */}
        {configuracion().mfaObligatorio ? null : (
          <p
            role="status"
            className="mb-4 rounded-md border border-marca-boton bg-marca-boton/10 px-4 py-2 text-sm text-marca-boton"
          >
            <strong>Segundo factor desactivado</strong> (`MFA_OBLIGATORIO=false`). Modo de ensayo:
            se entra solo con contraseña. RN-20 exige restituirlo antes de operar.
          </p>
        )}
        {children}
      </MarcoDeConsola>
    </ProveedorDeConsultas>
  );
};

export default LayoutDeConsola;
