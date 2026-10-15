'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { contrasenaValida } from '@/lib/politica-contrasena';
import { RequisitosDeContrasena } from '@/app/acceso/requisitos-contrasena';
import type { ResultadoDeCambio } from '@/app/api/sesion/contrasena/route';

/**
 * 15-Y1 · cambiar la contraseña desde el Perfil del residente (M-8), con las
 * mismas palabras que la app (`cambio_de_contrasena.dart`) y por la misma
 * ruta de la consola que usa el cambio obligatorio del primer ingreso
 * (`/api/sesion/contrasena` → `POST /auth/contrasena`). Si el proveedor no
 * renueva la sesión tras el cambio, se vuelve al acceso con la nueva.
 *
 * Las contraseñas viven sólo en el estado del formulario mientras está abierto:
 * nada va a `localStorage`, a la caché ni a los registros.
 */
export const CambiarContrasena = ({ alCerrar }: { readonly alCerrar: () => void }): JSX.Element => {
  const router = useRouter();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [hecho, setHecho] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const suficiente = contrasenaValida(nueva);
  const coinciden = nueva === repetida;
  const distinta = nueva !== actual;

  const enviar = async (): Promise<void> => {
    if (actual === '' || !suficiente || !coinciden || !distinta) return;
    setEnviando(true);
    setError(undefined);
    try {
      const r = await fetch('/api/sesion/contrasena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual, nueva }),
        credentials: 'same-origin',
      });
      const datos = (await r.json()) as ResultadoDeCambio & { mensaje?: string };
      if (!r.ok) {
        setError(datos.mensaje ?? 'No se pudo cambiar la contraseña.');
        return;
      }
      setHecho(true);
      setActual('');
      setNueva('');
      setRepetida('');
      if (datos.siguiente === 'acceso') {
        router.replace('/acceso?aviso=cambio');
        router.refresh();
      }
    } catch {
      setError('No hay conexión con la consola. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  if (hecho) {
    return (
      <div className="space-y-3">
        <p
          role="status"
          className="rounded-campo bg-exito-suave px-3 py-2 text-secundario text-exito-texto"
        >
          Contraseña cambiada. La próxima vez entra con la nueva.
        </p>
        <Boton type="button" variante="secundario" onClick={alCerrar}>
          Cerrar
        </Boton>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <Campo
        etiqueta="Contraseña actual"
        name="actual"
        type="password"
        autoComplete="current-password"
        required
        value={actual}
        onChange={(e) => setActual(e.target.value)}
        error={error}
      />
      <Campo
        etiqueta="Contraseña nueva"
        name="nueva"
        type="password"
        autoComplete="new-password"
        required
        value={nueva}
        onChange={(e) => setNueva(e.target.value)}
        error={nueva !== '' && !distinta ? 'Tiene que ser distinta de la actual.' : undefined}
        aria-describedby="requisitos-perfil"
      />
      <RequisitosDeContrasena contrasena={nueva} id="requisitos-perfil" />
      <Campo
        etiqueta="Repita la contraseña nueva"
        name="repetida"
        type="password"
        autoComplete="new-password"
        required
        value={repetida}
        onChange={(e) => setRepetida(e.target.value)}
        error={repetida !== '' && !coinciden ? 'Las dos contraseñas no coinciden' : undefined}
      />
      <div className="flex flex-wrap gap-2">
        <Boton
          type="submit"
          cargando={enviando}
          disabled={actual === '' || !suficiente || !coinciden || !distinta}
        >
          Cambiar contraseña
        </Boton>
        <Boton type="button" variante="fantasma" onClick={alCerrar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
};
