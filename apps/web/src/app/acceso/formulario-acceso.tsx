'use client';

import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import type { ResultadoDeAcceso } from '@/app/api/sesion/route';

type Paso = 'credenciales' | 'segundo-factor';

/**
 * Formulario de acceso en dos pasos.
 *
 * Lo que este componente **no** hace: hablar con Supabase. Envía las
 * credenciales a su propio origen (`/api/sesion`), y es el servidor quien
 * contacta con el proveedor de identidad y guarda el token en una cookie
 * `httpOnly`. Consecuencia directa: ningún script de la página —ni uno inyectado
 * por un XSS— puede leer la sesión.
 *
 * Estados que el mockup no dibujaba y que aquí existen: credenciales inválidas,
 * bloqueo por límite de peticiones con su espera, servicio de identidad caído,
 * botón en curso y el paso de segundo factor completo.
 */
export const FormularioDeAcceso = ({ className }: { readonly className?: string }): JSX.Element => {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>('credenciales');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [codigo, setCodigo] = useState('');
  const [verContrasena, setVerContrasena] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (
    url: string,
    cuerpo: Record<string, string>,
    alTerminar: (r: ResultadoDeAcceso) => void,
  ): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        credentials: 'same-origin',
      });
      const datos = (await respuesta.json()) as ResultadoDeAcceso & { mensaje?: string };
      if (!respuesta.ok) {
        setError(datos.mensaje ?? 'No se pudo completar el acceso.');
        return;
      }
      alTerminar(datos);
    } catch {
      // Distinguir «tu red» de «tu contraseña» ahorra al usuario reintentar
      // credenciales correctas una y otra vez.
      setError('No hay conexión con la consola. Revisa tu red e inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  if (paso === 'segundo-factor') {
    return (
      <form
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          void enviar('/api/sesion/mfa', { codigo }, () => {
            router.replace('/');
            router.refresh();
          });
        }}
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-seccion">Verificación en dos pasos</h2>
            <p className="mt-1 text-secundario text-texto-apagado">
              Tu rol exige un segundo factor. Escribe el código de tu aplicación de autenticación, o
              uno de recuperación.
            </p>
          </div>
          <Campo
            etiqueta="Código"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.trim())}
            ayuda="Seis dígitos, o un código de recuperación con la forma XXXXX-XXXXX."
            error={error}
          />
          <Boton type="submit" anchoCompleto cargando={enviando} disabled={codigo.length < 6}>
            Verificar
          </Boton>
          <Boton
            type="button"
            variante="fantasma"
            anchoCompleto
            onClick={() => {
              setPaso('credenciales');
              setCodigo('');
              setError(undefined);
            }}
          >
            Usar otra cuenta
          </Boton>
        </div>
      </form>
    );
  }

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        void enviar('/api/sesion', { correo, contrasena }, (r) => {
          if (r.siguiente === 'segundo-factor') {
            setPaso('segundo-factor');
            setContrasena('');
            return;
          }
          router.replace('/');
          router.refresh();
        });
      }}
    >
      <div className="space-y-4">
        <Campo
          etiqueta="Correo electrónico"
          name="correo"
          type="email"
          autoComplete="username"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="nombre@copropiedad.com"
        />
        <Campo
          etiqueta="Contraseña"
          name="contrasena"
          type={verContrasena ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          error={error}
          sufijo={
            <Boton
              type="button"
              variante="fantasma"
              tamano="sm"
              onClick={() => setVerContrasena((v) => !v)}
              aria-pressed={verContrasena}
            >
              {verContrasena ? 'Ocultar' : 'Ver'}
            </Boton>
          }
        />
        <Boton
          type="submit"
          anchoCompleto
          cargando={enviando}
          disabled={correo === '' || contrasena === ''}
        >
          Iniciar sesión
        </Boton>
        <p className="text-secundario text-texto-apagado">
          ¿Olvidaste la contraseña? Escribe al administrador de tu copropiedad: la recuperación se
          gestiona desde el panel de identidad, no desde aquí.
        </p>
      </div>
    </form>
  );
};
