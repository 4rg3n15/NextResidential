'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EstadoDeSesionDePorteria } from '@ncr/contracts';
import { Boton } from './ui/boton';
import { Campo } from './ui/campo';
import { Tarjeta } from './ui/tarjeta';
import { cliente, desenvolver } from '@/lib/api/cliente';

const hora = (iso: string | null): string =>
  iso === null
    ? '—'
    : new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(iso),
      );

/**
 * PATRULLAJE · la pantalla de bloqueo (ADR-024).
 *
 * El bloqueo lo impone la API —toda acción operativa de la sesión responde
 * 423—; esta pantalla sólo lo hace visible. Por eso recargar no la quita: el
 * marco de la consola pregunta a la API en cada carga, y la API sigue diciendo
 * «patrullaje» hasta que llegue el código.
 *
 * Es un BLOQUEO DE PANTALLA, no un segundo factor: el código se mostró en esta
 * misma consola antes de salir. El quinto código equivocado cierra la sesión
 * del todo y hay que volver a entrar con la contraseña.
 */
export const BloqueoDePatrullaje = ({
  estado,
}: {
  readonly estado: EstadoDeSesionDePorteria;
}): JSX.Element => {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [restantes, setRestantes] = useState<number | null>(estado.intentosRestantes);
  const [enviando, setEnviando] = useState(false);

  const salir = async (aviso: string): Promise<void> => {
    await fetch('/api/sesion', { method: 'DELETE', credentials: 'same-origin' }).catch(
      () => undefined,
    );
    router.replace(`/acceso?aviso=${aviso}`);
    router.refresh();
  };

  const desbloquear = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      const { resultado } = desenvolver(
        await cliente.POST('/porteria/sesion/desbloqueo', { body: { codigo } }),
      );
      if (resultado === 'desbloqueada' || resultado === 'no_en_patrullaje') {
        router.refresh();
        return;
      }
      if (resultado === 'agotado') {
        await salir('patrullaje');
        return;
      }
      const quedan = (restantes ?? 5) - 1;
      setRestantes(quedan);
      setCodigo('');
      setError(
        quedan === 1
          ? 'Código incorrecto. Te queda UN intento: el siguiente fallo cierra la sesión.'
          : `Código incorrecto. Te quedan ${quedan} intentos.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo comprobar el código.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-lienzo px-4">
      <Tarjeta className="w-full max-w-md p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{4}$/.test(codigo)) void desbloquear();
          }}
          className="space-y-4"
        >
          <div>
            <h1 className="text-seccion">Patrullaje en curso</h1>
            <p className="mt-1 text-secundario text-texto-apagado">
              Desde las {hora(estado.patrullajeDesde)}. La consola está bloqueada y el sistema
              rechaza toda acción de esta sesión hasta que escribas el código que se mostraba arriba
              a la derecha.
            </p>
            {estado.turnoFin === null ? null : (
              <p className="mt-1 text-secundario text-texto-apagado">
                Tu turno termina a las {hora(estado.turnoFin)}.
              </p>
            )}
          </div>
          <Campo
            etiqueta="Código de patrullaje"
            name="codigo"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={4}
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4))}
            ayuda={restantes === null ? undefined : `Intentos disponibles: ${restantes}`}
            error={error}
          />
          <Boton type="submit" anchoCompleto cargando={enviando} disabled={codigo.length !== 4}>
            Volver a la consola
          </Boton>
          <Boton
            type="button"
            variante="fantasma"
            anchoCompleto
            onClick={() => void salir('sesion')}
          >
            Cerrar sesión
          </Boton>
        </form>
      </Tarjeta>
    </main>
  );
};
