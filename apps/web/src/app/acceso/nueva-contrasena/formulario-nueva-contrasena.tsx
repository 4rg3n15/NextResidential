'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { cn } from '@/lib/cn';
import { REQUISITOS, contrasenaValida, requisitosCumplidos } from '@/lib/politica-contrasena';

/**
 * La política vive en UN solo módulo, compartido con el servidor.
 *
 * Aquí había una constante y en la ruta del servidor otra igual, cada una con
 * un comentario diciendo que coincidía con la otra. Dos números que hay que
 * acordarse de mover a la vez acaban separándose, y entonces el usuario lee una
 * regla en pantalla y recibe otra en la respuesta.
 */
export { LONGITUD_MINIMA } from '@/lib/politica-contrasena';

/**
 * Establecimiento de la contraseña nueva.
 *
 * El `token_hash` no se guarda en ningún sitio del navegador: viaja una sola
 * vez en el cuerpo de la petición al propio origen, y el servidor lo canjea.
 * Guardarlo en `localStorage` «por si el usuario recarga» lo dejaría legible
 * para cualquier script de la página.
 */
export const FormularioDeNuevaContrasena = ({
  tokenHash,
  className,
}: {
  readonly tokenHash: string | null;
  readonly className?: string;
}): JSX.Element => {
  const router = useRouter();
  const [contrasena, setContrasena] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  if (tokenHash === null) {
    return (
      <div className={className}>
        <div
          role="alert"
          className="rounded-tarjeta border border-aviso/30 bg-aviso-suave px-4 py-3 text-cuerpo text-aviso-texto"
        >
          Este enlace no es válido o ya se usó. Los enlaces de recuperación son de un solo uso.
        </div>
        <Link
          href="/acceso/recuperacion"
          className="mt-4 inline-block font-medium text-marca-texto underline underline-offset-2"
        >
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  const cumplidos = requisitosCumplidos(contrasena);
  const suficiente = contrasenaValida(contrasena);
  const coinciden = contrasena === repetida;

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (!suficiente || !coinciden) return;
        setEnviando(true);
        setError(undefined);
        void fetch('/api/sesion/nueva-contrasena', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenHash, contrasena }),
          credentials: 'same-origin',
        })
          .then(async (r) => {
            const datos = (await r.json()) as { mensaje?: string };
            if (!r.ok) {
              setError(datos.mensaje ?? 'No se pudo cambiar la contraseña.');
              return;
            }
            // Se vuelve al acceso y no a la consola: quien restablece llega con
            // una sesión `aal1`, y un rol administrativo tiene que completar su
            // segundo factor antes de operar (RN-20).
            router.replace('/acceso');
            router.refresh();
          })
          .catch(() => setError('No hay conexión con la consola. Inténtalo de nuevo.'))
          .finally(() => setEnviando(false));
      }}
    >
      <div className="space-y-4">
        <Campo
          etiqueta="Contraseña nueva"
          name="contrasena"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          ayuda="No reutilices la anterior."
          error={error}
          aria-describedby="requisitos-contrasena"
        />
        {/**
         * Los cinco requisitos, marcándose en vivo.
         *
         * Se muestran TODOS desde el principio en vez de ir reprochando uno
         * cada vez: decir «falta una mayúscula», y al corregirlo «falta un
         * número», obliga a descubrir la regla a base de intentos.
         *
         * `aria-live="polite"` y no `assertive`: el lector anuncia el cambio al
         * terminar de teclear, sin interrumpir cada pulsación. Y el estado no
         * se transmite solo por color —hay un símbolo y texto—, porque §5.6.2
         * lo exige y porque el verde y el gris son el mismo gris para quien no
         * distingue el verde.
         */}
        <ul id="requisitos-contrasena" aria-live="polite" className="space-y-1">
          {REQUISITOS.map((r) => {
            const cumple = cumplidos[r.clave];
            return (
              <li key={r.clave} className="flex items-center gap-2 text-secundario">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none transition-colors duration-150 motion-reduce:transition-none',
                    cumple
                      ? 'border-exito bg-exito-suave text-exito'
                      : 'border-borde text-texto-apagado',
                  )}
                >
                  {cumple ? '✓' : ''}
                </span>
                <span className={cumple ? 'text-texto' : 'text-texto-apagado'}>
                  {r.texto}
                  <span className="sr-only">{cumple ? ' · cumplido' : ' · pendiente'}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <Campo
          etiqueta="Repite la contraseña"
          name="repetida"
          type="password"
          autoComplete="new-password"
          required
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          error={repetida !== '' && !coinciden ? 'Las dos contraseñas no coinciden.' : undefined}
        />
        <Boton type="submit" anchoCompleto cargando={enviando} disabled={!suficiente || !coinciden}>
          Cambiar contraseña
        </Boton>
      </div>
    </form>
  );
};
