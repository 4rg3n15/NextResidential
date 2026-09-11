import type { JSX, ReactNode } from 'react';
import paquete from '../../../package.json';

/**
 * Marco compartido de las tres pantallas previas a la sesión: acceso,
 * recuperación y contraseña nueva.
 *
 * Existe porque las tres son la misma pantalla con distinto formulario, y
 * duplicar el panel de marca en cada una garantizaba que se separaran. El
 * número de versión sale del `package.json` en tiempo de construcción: el
 * mockup traía un «4.2.1-Prod» ficticio que no debe llegar al entregable (C-14).
 *
 * **Por qué se importa el módulo entero y se lee el campo, en vez de
 * `import { version }`.** Un JSON no tiene exportaciones con nombre: el
 * empaquetador las sintetiza y avisa de ello en cada compilación —«Should not
 * import the named export 'version' from default-exporting module»—. El aviso
 * no era cosmético: esa síntesis impide que el módulo se trate como un JSON
 * estático, y bastaba con leer el campo del objeto para que dejara de hacer
 * falta.
 */
const { version } = paquete;
export const MarcoDeAcceso = ({
  titulo,
  descripcion,
  children,
}: {
  readonly titulo: string;
  readonly descripcion: string;
  readonly children: ReactNode;
}): JSX.Element => (
  <main id="contenido" className="grid min-h-dvh lg:grid-cols-[minmax(0,26rem)_1fr]">
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
        <h1 className="text-titulo">{titulo}</h1>
        <p className="mt-1 text-cuerpo text-texto-apagado">{descripcion}</p>
        {children}
      </div>
    </section>
  </main>
);
