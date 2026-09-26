'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { contrasenaValida } from '@/lib/politica-contrasena';
import type { ResultadoDeCambio } from '@/app/api/sesion/contrasena/route';
import { RequisitosDeContrasena } from './requisitos-contrasena';

/**
 * PRIMER INGRESO · cambio de contraseña obligatorio (ADR-023).
 *
 * La pantalla es cortesía: lo que obliga es la API, que responde 403 a toda
 * ruta salvo ésta y el cierre mientras el indicador siga encendido. Por eso
 * aquí no hay atajo para «saltar»: no llevaría a ninguna parte.
 *
 * La contraseña actual se pide aunque la cuenta acabe de entrar con ella: la
 * API la comprueba contra el proveedor, y así un token olvidado en un equipo
 * no basta para cambiarle la contraseña a nadie.
 */
export const CambioObligatorio = ({
  className,
  alTerminar,
  alCancelar,
}: {
  readonly className?: string | undefined;
  readonly alTerminar: (r: ResultadoDeCambio) => void;
  readonly alCancelar: () => void;
}): JSX.Element => {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  const suficiente = contrasenaValida(nueva);
  const coinciden = nueva === repetida;
  const distinta = nueva !== actual;

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (!suficiente || !coinciden || !distinta) return;
        setEnviando(true);
        setError(undefined);
        void fetch('/api/sesion/contrasena', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actual, nueva }),
          credentials: 'same-origin',
        })
          .then(async (r) => {
            const datos = (await r.json()) as ResultadoDeCambio & { mensaje?: string };
            if (!r.ok) {
              setError(datos.mensaje ?? 'No se pudo cambiar la contraseña.');
              return;
            }
            alTerminar(datos);
          })
          .catch(() => setError('No hay conexión con la consola. Inténtalo de nuevo.'))
          .finally(() => setEnviando(false));
      }}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-seccion">Cambia tu contraseña</h2>
          <p className="mt-1 text-secundario text-texto-apagado">
            Es tu primer ingreso o te la restablecieron. Hasta cambiarla no puedes operar: la
            contraseña inicial la escribió otra persona.
          </p>
        </div>
        <Campo
          etiqueta="Contraseña actual"
          name="actual"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
        <Campo
          etiqueta="Contraseña nueva"
          name="nueva"
          type="password"
          autoComplete="new-password"
          required
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          error={
            error ??
            (nueva !== '' && !distinta ? 'Tiene que ser distinta de la actual.' : undefined)
          }
          aria-describedby="requisitos-cambio"
        />
        <RequisitosDeContrasena contrasena={nueva} id="requisitos-cambio" />
        <Campo
          etiqueta="Repite la contraseña nueva"
          name="repetida"
          type="password"
          autoComplete="new-password"
          required
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          error={repetida !== '' && !coinciden ? 'Las dos contraseñas no coinciden.' : undefined}
        />
        <Boton
          type="submit"
          anchoCompleto
          cargando={enviando}
          disabled={actual === '' || !suficiente || !coinciden || !distinta}
        >
          Cambiar y continuar
        </Boton>
        <Boton type="button" variante="fantasma" anchoCompleto onClick={alCancelar}>
          Salir
        </Boton>
      </div>
    </form>
  );
};
