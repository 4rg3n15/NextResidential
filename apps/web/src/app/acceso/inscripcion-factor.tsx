'use client';

import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';

/**
 * Inscripción del segundo factor — el paso que faltaba y dejaba el sistema
 * inaccesible.
 *
 * Los tres roles administrativos no entran sin `aal2` (RN-20, CA-25). El panel
 * de Supabase permite *retirar* factores de un usuario de la aplicación pero no
 * darlos de alta —y hace bien: un factor inscrito por un tercero no es un
 * segundo factor—, así que sin esta pantalla no había ninguna vía. El usuario
 * se autenticaba y la API le respondía 401 en todo.
 *
 * **Nadie inscribe el factor de otro.** El componente no envía ningún
 * identificador de usuario: el servidor lo toma de la cookie `httpOnly`. No es
 * una comprobación que se pueda olvidar — es que no existe el dato con el que
 * equivocarse.
 *
 * El secreto se ofrece además en texto porque escanear no siempre es posible:
 * un equipo de portería sin cámara, o alguien que usa un gestor de contraseñas
 * de escritorio. Sin esa alternativa, la pantalla bloquea a quien no puede
 * escanear igual que antes bloqueaba a todo el mundo.
 */
export const InscripcionDeFactor = ({
  className,
  alVerificar,
  alCancelar,
}: {
  readonly className?: string | undefined;
  readonly alVerificar: () => void;
  readonly alCancelar: () => void;
}): JSX.Element => {
  const [qr, setQr] = useState<string | null>(null);
  const [secreto, setSecreto] = useState('');
  const [codigo, setCodigo] = useState('');
  const [verSecreto, setVerSecreto] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  /**
   * Un intento con éxito BORRA el error del intento anterior.
   *
   * Sin esto, un fallo transitorio deja la pantalla inservible aunque el
   * sistema funcione: fue el defecto reportado desde el proyecto real. El
   * navegador hizo dos peticiones —el modo estricto de React invoca el efecto
   * dos veces en desarrollo—, la primera devolvió `503`, la segunda `200` con
   * el QR, y la pantalla se quedó con el mensaje rojo de la primera y sin
   * pintar el código. Quien lo vio no podía inscribir el factor, así que no
   * podía entrar.
   *
   * Se resuelve con dos reglas, no con una:
   *
   *  1. **El último intento manda.** `intento` numera cada petición y solo se
   *     aplica la respuesta del intento vigente. Un error viejo no puede
   *     sobrescribir un éxito nuevo, y tampoco al contrario.
   *  2. **El éxito limpia.** Al recibir el QR se borra el error, sea de quien
   *     sea. Un mensaje de fallo junto a un QR válido es peor que ninguno de
   *     los dos: hace que el titular no confíe en lo que sí funciona.
   *
   * `intentoVigente` es una referencia y no un estado a propósito: cambiarlo no
   * debe repintar, y leerlo dentro de una respuesta tardía tiene que dar el
   * valor de AHORA, no el que estaba capturado cuando salió la petición.
   */
  const intentoVigente = useRef(0);

  const pedirInscripcion = useCallback((): void => {
    const intento = intentoVigente.current + 1;
    intentoVigente.current = intento;
    setCargando(true);

    void fetch('/api/sesion/mfa/inscripcion', { method: 'POST', credentials: 'same-origin' })
      .then(async (r) => {
        const datos = (await r.json()) as { qr?: string; secreto?: string; mensaje?: string };
        // Respuesta de un intento superado: se descarta entera. No se pinta su
        // error ni su QR.
        if (intento !== intentoVigente.current) return;
        if (!r.ok) {
          setError(datos.mensaje ?? 'No se pudo iniciar la inscripción.');
          return;
        }
        setError(undefined);
        setQr(datos.qr ?? null);
        setSecreto(datos.secreto ?? '');
      })
      .catch(() => {
        if (intento !== intentoVigente.current) return;
        setError('No hay conexión con la consola. Inténtalo de nuevo.');
      })
      .finally(() => {
        if (intento === intentoVigente.current) setCargando(false);
      });
  }, []);

  useEffect(() => {
    pedirInscripcion();
    // Al desmontar se invalida el intento en curso: sin esto, volver atrás deja
    // una petición en vuelo que escribe sobre un componente que ya no está.
    return () => {
      intentoVigente.current += 1;
    };
  }, [pedirInscripcion]);

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        setEnviando(true);
        setError(undefined);
        void fetch('/api/sesion/mfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo }),
          credentials: 'same-origin',
        })
          .then(async (r) => {
            const datos = (await r.json()) as { mensaje?: string };
            if (!r.ok) {
              setError(datos.mensaje ?? 'El código no es válido.');
              return;
            }
            alVerificar();
          })
          .catch(() => setError('No hay conexión con la consola.'))
          .finally(() => setEnviando(false));
      }}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-seccion">Configura tu segundo factor</h2>
          <p className="mt-1 text-secundario text-texto-apagado">
            Tu rol lo exige (RN-20). Escanea el código con tu aplicación de autenticación y
            escribe el número que te muestre.
          </p>
        </div>

        {cargando ? (
          <div className="h-48 animate-pulse rounded-tarjeta bg-borde-suave motion-reduce:animate-none" />
        ) : qr === null ? (
          /**
           * Sin QR no hay nada que teclear, así que NO se muestra el campo del
           * código. Antes se mostraba, y era la pantalla que el cliente
           * describió: un campo inútil junto a un mensaje rojo, sin salida. Lo
           * que se ofrece aquí es lo único que sirve — volver a intentarlo.
           */
          <div className="space-y-3">
            <p
              role="alert"
              className="rounded-tarjeta border border-peligro/30 bg-peligro-suave px-4 py-3 text-cuerpo text-peligro-texto"
            >
              {error ?? 'No se pudo iniciar la inscripción.'}
            </p>
            <Boton type="button" variante="secundario" anchoCompleto onClick={pedirInscripcion}>
              Volver a intentarlo
            </Boton>
          </div>
        ) : (
          <>
            <div className="flex justify-center rounded-tarjeta border border-borde bg-white p-4">
              {/* Supabase devuelve el QR como SVG en un `data:`; `img-src` de la
                  CSP admite `data:` justamente para esto. */}
              <img
                src={qr}
                alt="Código QR para la aplicación de autenticación"
                className="h-44 w-44"
              />
            </div>

            {secreto === '' ? null : (
              <div className="rounded-tarjeta border border-borde bg-lienzo p-3">
                <button
                  type="button"
                  onClick={() => setVerSecreto((v) => !v)}
                  aria-expanded={verSecreto}
                  className="text-secundario font-medium text-marca-texto underline underline-offset-2"
                >
                  {verSecreto ? 'Ocultar la clave' : '¿No puedes escanear? Escribe la clave'}
                </button>
                {verSecreto ? (
                  <p className="mt-2 select-all break-all font-mono text-secundario text-texto">
                    {secreto}
                  </p>
                ) : null}
              </div>
            )}

            <Campo
              etiqueta="Código de verificación"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.trim())}
              ayuda="Seis dígitos de tu aplicación de autenticación."
              error={error}
            />

            <Boton type="submit" anchoCompleto cargando={enviando} disabled={codigo.length < 6}>
              Activar segundo factor
            </Boton>
          </>
        )}

        <Boton type="button" variante="fantasma" anchoCompleto onClick={alCancelar}>
          Usar otra cuenta
        </Boton>
      </div>
    </form>
  );
};
