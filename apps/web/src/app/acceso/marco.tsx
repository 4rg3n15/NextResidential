import type { JSX, ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
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
 *
 * **Lo que NO lleva, y es una decisión tomada:** el selector «TIPO DE USUARIO»
 * del mockup. Lo eliminó la contradicción C-05 por dos motivos independientes:
 * el rol no se elige, se deriva de los claims del token, y el selector sugiere
 * lo contrario; y además el mockup solo ofrecía tres de los seis roles. El
 * cliente lo reconfirmó el 2026-09-11: manda la resolución, se corrige el
 * mockup.
 */
const { version } = paquete;

const CORREO_SOPORTE = 'soporte@grupocontrol.co';

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
        {/**
         * Bloque de marca. El escudo es Lucide `shield-check` (ISC, ADR-013):
         * dice de qué va el producto —control de acceso— sin recurrir a un
         * candado, que en una pantalla de entrada se lee como «estás fuera».
         */}
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-boton bg-marca text-white"
          >
            <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-titulo font-bold leading-none">Next Control</p>
            <p className="mt-1 text-etiqueta uppercase tracking-wide text-texto-invertidoApagado">
              Residencial
            </p>
          </div>
        </div>

        <p className="mt-10 hidden max-w-xs text-seccion font-medium leading-snug lg:block">
          Seguridad inteligente residencial.
        </p>
        <p className="mt-3 hidden max-w-xs text-cuerpo text-texto-invertidoApagado lg:block">
          Next Control decide; el hardware ejecuta. Cada apertura queda registrada con quién, qué
          regla la permitió y con qué versión se decidió.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {/**
         * Pie de contacto — W-01 del mockup. Es lo que necesita quien no puede
         * entrar: sin proveedor de correo configurado todavía, el
         * restablecimiento depende de que alguien conteste.
         */}
        <p className="text-secundario text-texto-invertidoApagado">
          ¿Problemas para entrar?{' '}
          <a
            href={`mailto:${CORREO_SOPORTE}`}
            className="font-medium text-texto-invertido underline underline-offset-2 decoration-texto-invertidoApagado transition-colors duration-150 ease-out hover:decoration-texto-invertido motion-reduce:transition-none"
          >
            {CORREO_SOPORTE}
          </a>
        </p>
        <p className="text-secundario text-texto-invertidoApagado">
          © {new Date().getFullYear()} Grupo Control · versión {version}
        </p>
      </div>
    </aside>

    <section className="flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-titulo text-texto">{titulo}</h1>
        <p className="mt-1 text-cuerpo text-texto-apagado">{descripcion}</p>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  </main>
);
