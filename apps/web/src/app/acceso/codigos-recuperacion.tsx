'use client';

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';

/**
 * Códigos de recuperación, mostrados **una sola vez**.
 *
 * Qué resuelven: perder el teléfono. Supabase no ofrece códigos de
 * recuperación —su respuesta a ese caso es tener varios factores inscritos, lo
 * que no sirve si solo había uno—, así que los emite la API y guarda solo su
 * hash.
 *
 * Qué NO hacen, y la pantalla lo dice porque importa: **no dan acceso**. El
 * `aal2` lo emite Supabase (ADR-008). Un código autoriza a retirar el factor
 * perdido para inscribir otro, y nada más.
 *
 * El botón de continuar exige una confirmación explícita de que se han
 * guardado. Es fricción a propósito: quien pulsa «continuar» sin leer descubre
 * el problema el día que pierde el teléfono, que es el peor momento posible.
 */
export const CodigosDeRecuperacion = ({
  className,
  alTerminar,
}: {
  readonly className?: string | undefined;
  readonly alTerminar: () => void;
}): JSX.Element => {
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [guardados, setGuardados] = useState(false);
  const [copiado, setCopiado] = useState(false);

  /**
   * **El último intento manda, y aquí importa más que en cualquier otra
   * pantalla.** El modo estricto de React lanza dos peticiones, y cada llamada
   * a `/auth/mfa/codigos` **invalida el juego anterior**: solo el último
   * conjunto emitido sirve. Si se pintara la respuesta que llegue primero, el
   * titular podría estar apuntando diez códigos que ya no abren nada — y lo
   * descubriría el día que pierda el teléfono, que es el peor momento posible.
   */
  const intentoVigente = useRef(0);

  useEffect(() => {
    const intento = intentoVigente.current + 1;
    intentoVigente.current = intento;
    void fetch('/api/ncr/auth/mfa/codigos', { method: 'POST', credentials: 'same-origin' })
      .then(async (r) => {
        if (intento !== intentoVigente.current) return;
        if (!r.ok) {
          // No es un bloqueo: el segundo factor ya está activo y se puede
          // entrar. Los códigos se regeneran después desde el perfil.
          setError('No se pudieron generar los códigos. Podrás generarlos más tarde.');
          return;
        }
        const datos = (await r.json()) as { codigos?: string[] };
        setCodigos(datos.codigos ?? []);
      })
      .catch(() => {
        if (intento === intentoVigente.current) {
          setError('No se pudieron generar los códigos.');
        }
      });
    return () => {
      intentoVigente.current += 1;
    };
  }, []);

  return (
    <div className={className}>
      <div className="space-y-4">
        <div>
          <h2 className="text-seccion">Guarda tus códigos de recuperación</h2>
          <p className="mt-1 text-secundario text-texto-apagado">
            Se muestran <strong>una sola vez</strong>. Si pierdes el teléfono, son la única forma
            de recuperar el acceso sin ayuda de nadie.
          </p>
        </div>

        {error !== undefined ? (
          <p role="alert" className="rounded-tarjeta border border-aviso/30 bg-aviso-suave px-4 py-3 text-cuerpo text-aviso-texto">
            {error}
          </p>
        ) : codigos === null ? (
          <div className="h-40 animate-pulse rounded-tarjeta bg-borde-suave motion-reduce:animate-none" />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-2 rounded-tarjeta border border-borde bg-lienzo p-4 font-mono text-cuerpo">
              {codigos.map((c) => (
                <li key={c} className="select-all tracking-wider">
                  {c}
                </li>
              ))}
            </ul>
            <Boton
              type="button"
              variante="secundario"
              anchoCompleto
              onClick={() => {
                void navigator.clipboard?.writeText(codigos.join('\n')).then(
                  () => setCopiado(true),
                  () => setCopiado(false),
                );
              }}
            >
              {copiado ? 'Copiados al portapapeles' : 'Copiar los códigos'}
            </Boton>
            <p className="text-secundario text-texto-apagado">
              Un código <strong>no da acceso</strong>: sirve para retirar el factor perdido y
              poder configurar otro. Cada uno funciona una sola vez.
            </p>
            <label className="flex items-start gap-2 text-secundario text-texto">
              <input
                type="checkbox"
                checked={guardados}
                onChange={(e) => setGuardados(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              He guardado los códigos en un lugar seguro.
            </label>
          </>
        )}

        <Boton
          type="button"
          anchoCompleto
          disabled={codigos !== null && !guardados}
          onClick={alTerminar}
        >
          Entrar a la consola
        </Boton>
      </div>
    </div>
  );
};
