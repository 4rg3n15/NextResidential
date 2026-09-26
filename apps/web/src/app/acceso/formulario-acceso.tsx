'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { CodigosDeRecuperacion } from './codigos-recuperacion';
import { InscripcionDeFactor } from './inscripcion-factor';
import { CambioObligatorio } from './cambio-obligatorio';
import type { ResultadoDeAcceso } from '@/app/api/sesion/route';

type Paso = 'credenciales' | 'inscripcion' | 'segundo-factor' | 'codigos' | 'cambio';

/**
 * ETAPA 15-H (ADR-023) y 15-I (D1) · la copropiedad —su CÓDIGO corto o su NIT—
 * se recuerda en ESTE equipo: un portero entra cada turno desde la misma
 * garita, y escribirla cada vez es donde se equivoca. Es un dato público del
 * conjunto, no una credencial; aun así va a `localStorage` sólo como comodidad
 * y la página funciona igual sin él. La clave antigua (sólo NIT) se sigue leyendo.
 */
const CLAVE_COPROPIEDAD = 'ncr:copropiedad-de-acceso';
const CLAVE_NIT_ANTERIOR = 'ncr:nit-de-acceso';
const leerCopropiedad = (): string => {
  try {
    return (
      window.localStorage.getItem(CLAVE_COPROPIEDAD) ??
      window.localStorage.getItem(CLAVE_NIT_ANTERIOR) ??
      ''
    );
  } catch {
    return '';
  }
};
const guardarCopropiedad = (valor: string): void => {
  try {
    window.localStorage.setItem(CLAVE_COPROPIEDAD, valor);
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): se escribe cada vez.
  }
};

/**
 * D1 · «código o NIT» en un solo campo. Un NIT son cifras (con puntos y el
 * dígito de verificación tras un guion); un código lleva al menos una letra o
 * tiene menos de cinco caracteres —la API no deja asignar uno que parezca un
 * NIT (S-58)—. Así la consola nunca tiene que adivinar.
 */
export const identificadorDeCopropiedad = (
  valor: string,
): { readonly codigo: string } | { readonly nit: string } => {
  const limpio = valor.trim();
  const sinSeparadores = limpio.replace(/[\s.,]/g, '');
  return /^[0-9]{5,15}(-[0-9])?$/.test(sinSeparadores) ? { nit: limpio } : { codigo: limpio };
};

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
export const FormularioDeAcceso = ({
  className,
  pasoInicial = 'credenciales',
}: {
  readonly className?: string;
  /** 15-H · la consola manda aquí a quien tiene el cambio de contraseña pendiente. */
  readonly pasoInicial?: 'credenciales' | 'cambio';
}): JSX.Element => {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>(pasoInicial);
  const [correo, setCorreo] = useState('');
  const [copropiedad, setCopropiedad] = useState('');
  const [aviso, setAviso] = useState<string | undefined>(undefined);
  useEffect(() => setCopropiedad(leerCopropiedad()), []);
  /** Sin arroba es un NOMBRE DE USUARIO, y entonces hace falta el código o el NIT (D1, C-34). */
  const porUsuario = correo.trim() !== '' && !correo.includes('@');
  const [contrasena, setContrasena] = useState('');
  const [codigo, setCodigo] = useState('');
  const [verContrasena, setVerContrasena] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (
    url: string,
    /**
     * `boolean` además de `string`, y no por comodidad: el servidor lee
     * `recordar === true`. Enviarlo como `'true'` habría dejado el interruptor
     * DECORATIVO —el caso exacto que su propio comentario dice evitar— sin que
     * nada fallara: la petición va bien, la sesión se crea y la permanencia es
     * siempre la corta. Un defecto que ninguna prueba de tipos veía mientras la
     * firma aceptara solo cadenas.
     */
    cuerpo: Record<string, string | boolean>,
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

  if (paso === 'cambio') {
    return (
      <CambioObligatorio
        className={className}
        alTerminar={(r) => {
          if (r.siguiente === 'segundo-factor' || r.siguiente === 'inscripcion') {
            setPaso(r.siguiente);
            return;
          }
          if (r.siguiente === 'acceso') {
            setPaso('credenciales');
            setAviso('Contraseña cambiada. Vuelve a entrar con la nueva.');
            return;
          }
          router.replace('/');
          router.refresh();
        }}
        alCancelar={() => {
          void fetch('/api/sesion', { method: 'DELETE', credentials: 'same-origin' }).finally(
            () => {
              setPaso('credenciales');
              router.replace('/acceso');
            },
          );
        }}
      />
    );
  }

  if (paso === 'inscripcion') {
    return (
      <InscripcionDeFactor
        className={className}
        alVerificar={() => setPaso('codigos')}
        alYaInscrito={() => setPaso('segundo-factor')}
        alCancelar={() => {
          setPaso('credenciales');
          setError(undefined);
        }}
      />
    );
  }

  if (paso === 'codigos') {
    return (
      <CodigosDeRecuperacion
        className={className}
        alTerminar={() => {
          router.replace('/');
          router.refresh();
        }}
      />
    );
  }

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
        const identificador = porUsuario
          ? { ...identificadorDeCopropiedad(copropiedad), usuario: correo.trim() }
          : { correo: correo.trim() };
        if (porUsuario) guardarCopropiedad(copropiedad.trim());
        void enviar('/api/sesion', { ...identificador, contrasena, recordar }, (r) => {
          if (r.siguiente === 'cambio-de-contrasena') {
            setPaso('cambio');
            setContrasena('');
            return;
          }
          if (r.siguiente === 'segundo-factor' || r.siguiente === 'inscripcion') {
            setPaso(r.siguiente);
            setContrasena('');
            return;
          }
          router.replace('/');
          router.refresh();
        });
      }}
    >
      <div className="space-y-4">
        {aviso === undefined ? null : (
          <p role="status" className="text-secundario text-exito-texto">
            {aviso}
          </p>
        )}
        <Campo
          etiqueta="Correo o usuario"
          name="correo"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="nombre@copropiedad.com o tu usuario"
          ayuda="Porteros y residentes entran con su usuario y el código (o el NIT) de la copropiedad."
        />
        {porUsuario ? (
          <Campo
            etiqueta="Código o NIT de la copropiedad"
            name="copropiedad"
            autoComplete="organization"
            autoCapitalize="characters"
            spellCheck={false}
            required
            value={copropiedad}
            onChange={(e) => setCopropiedad(e.target.value)}
            placeholder="MIRA o 900123456-7"
            ayuda="Se recuerda en este equipo para el próximo ingreso."
          />
        ) : null}
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
        {/**
         * «Recordar sesión en este equipo» — W-01 del mockup.
         *
         * **Hace algo de verdad.** Marcado, la cookie de refresco vive 30
         * días; sin marcar, es de sesión de navegador y muere al cerrarlo. Un
         * interruptor decorativo habría sido peor que ninguno: promete una
         * decisión sobre la permanencia en un equipo compartido —la portería
         * es exactamente eso— y no la cumple.
         *
         * Se dibuja como interruptor, como el mockup, pero el elemento es un
         * `<input type="checkbox">` de verdad: conserva el foco, la barra
         * espaciadora y el anuncio del lector de pantalla sin reimplementar
         * nada.
         */}
        <label className="flex cursor-pointer items-center gap-3 py-1">
          <span className="relative inline-flex shrink-0">
            <input
              type="checkbox"
              name="recordar"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              className="peer h-6 w-10 cursor-pointer appearance-none rounded-full bg-borde transition-colors duration-150 ease-out checked:bg-marca-boton focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca focus-visible:ring-offset-2 motion-reduce:transition-none"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-tarjeta shadow-tarjeta transition-transform duration-150 ease-out peer-checked:translate-x-4 motion-reduce:transition-none"
            />
          </span>
          <span className="text-cuerpo text-texto">
            Recordar sesión en este equipo
            <span className="block text-secundario text-texto-apagado">
              No lo marques en un equipo compartido.
            </span>
          </span>
        </label>
        <Boton
          type="submit"
          anchoCompleto
          cargando={enviando}
          disabled={correo === '' || contrasena === '' || (porUsuario && copropiedad.trim() === '')}
        >
          Iniciar sesión
        </Boton>
        <p className="text-secundario text-texto-apagado">
          <Link
            href="/acceso/recuperacion"
            className="font-medium text-marca-texto underline underline-offset-2"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </div>
    </form>
  );
};
