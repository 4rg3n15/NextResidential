'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';

/**
 * Solicitud de recuperación.
 *
 * **El acuse es el mismo exista o no la cuenta.** Es la mitad visible de la
 * decisión del servidor: si aquí se dijera «no encontramos ese correo», el
 * formulario sería un enumerador de usuarios por muy uniforme que fuera la
 * respuesta HTTP.
 *
 * Tras enviar se muestra el acuse **en lugar del formulario**, no debajo: con
 * el formulario todavía presente, la reacción natural es volver a pulsar, y
 * eso agota el cupo del limitador sin que el usuario entienda por qué.
 */
export const FormularioDeRecuperacion = ({
  className,
}: {
  readonly className?: string;
}): JSX.Element => {
  const [correo, setCorreo] = useState('');
  const [acuse, setAcuse] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  if (acuse !== null) {
    return (
      <div className={className}>
        <div
          role="status"
          className="rounded-tarjeta border border-exito/30 bg-exito-suave px-4 py-3 text-cuerpo text-exito-texto"
        >
          {acuse}
        </div>
        <p className="mt-4 text-secundario text-texto-apagado">
          El enlace caduca y solo se puede usar una vez. Si no llega en unos minutos, vuelve a
          intentarlo desde aquí.
        </p>
        <Link
          href="/acceso"
          className="mt-4 inline-block font-medium text-marca-texto underline underline-offset-2"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        setEnviando(true);
        setError(undefined);
        void fetch('/api/sesion/recuperacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correo }),
        })
          .then(async (r) => {
            const datos = (await r.json()) as { mensaje?: string };
            if (r.status === 429) {
              setError(datos.mensaje ?? 'Demasiados intentos.');
              return;
            }
            setAcuse(datos.mensaje ?? 'Solicitud recibida.');
          })
          .catch(() => setError('No hay conexión con la consola. Inténtalo de nuevo.'))
          .finally(() => setEnviando(false));
      }}
    >
      <div className="space-y-4">
        <Campo
          etiqueta="Correo electrónico"
          name="correo"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="nombre@copropiedad.com"
          error={error}
        />
        <Boton type="submit" anchoCompleto cargando={enviando} disabled={correo === ''}>
          Enviar enlace
        </Boton>
        <Link
          href="/acceso"
          className="block text-center text-secundario text-texto-apagado underline underline-offset-2"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    </form>
  );
};
