import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { sesionActual } from '@/lib/sesion/servidor';
import { rutaInicialDe } from '@/lib/navegacion';
import type { Rol } from '@ncr/contracts';
import { FormularioDeAcceso } from './formulario-acceso';
import { version } from '../../../package.json';

export const metadata: Metadata = { title: 'Acceso' };
export const dynamic = 'force-dynamic';

/**
 * W-01 · Acceso.
 *
 * **El selector «TIPO DE USUARIO» del mockup no está, y esa es la decisión.**
 * Hallazgo M-01 / contradicción C-05 de la auditoría: el rol no se elige, se
 * deriva de los claims del token (ETAPA 03). Un selector en el cliente sugiere
 * que la elección influye en los permisos —no lo hace, ni debe—, y además el
 * mockup solo ofrecía tres de los seis roles. El sistema enruta a la superficie
 * que corresponde al rol del token.
 *
 * Lo que sí se añade y el mockup no tenía: **paso de segundo factor** para los
 * roles administrativos (RN-20, CA-25).
 */
const Acceso = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion !== null) redirect(rutaInicialDe(sesion.rol as Rol));

  return (
    <main id="contenido" className="grid min-h-dvh lg:grid-cols-[minmax(0,26rem)_1fr]">
      {/* Panel de marca. En pantallas estrechas se reduce a una cabecera: el
          mockup lo dibuja a pantalla completa y ahí no cabe. */}
      <aside className="superficie-oscura flex flex-col justify-between bg-oscuro px-8 py-8 text-texto-invertido lg:px-10 lg:py-12">
        <div>
          <p className="text-titulo font-bold">Next Control</p>
          <p className="text-etiqueta uppercase text-texto-invertidoApagado">Residencial</p>
        </div>
        <p className="mt-8 hidden max-w-xs text-cuerpo text-texto-invertidoApagado lg:block">
          Seguridad inteligente residencial. Next Control decide; el hardware ejecuta.
        </p>
        <p className="mt-8 text-secundario text-texto-invertidoApagado">
          © {new Date().getFullYear()} Grupo Control · versión {version}
        </p>
      </aside>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-titulo">Iniciar sesión</h1>
          <p className="mt-1 text-cuerpo text-texto-apagado">
            Accede con el correo de tu copropiedad.
          </p>
          <FormularioDeAcceso className="mt-8" />
        </div>
      </section>
    </main>
  );
};

export default Acceso;
