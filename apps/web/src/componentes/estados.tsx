import type { JSX } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Boton } from './ui/boton';

/**
 * Los cinco estados que `CLAUDE.md` §6 exige en TODA vista y que el mockup no
 * dibuja en ninguna de sus dieciocho pantallas — el hallazgo más voluminoso de
 * la auditoría (`03-mockups.md` §4).
 *
 * Están aquí, juntos y como componentes, por una razón concreta: si cada
 * pantalla los improvisara, «sin permiso» y «no encontrado» acabarían
 * pareciéndose, y en este sistema **no** son lo mismo. Un recurso de otra
 * copropiedad devuelve 404 a propósito, porque un 403 confirmaría que el
 * identificador existe; la consola tiene que tratarlo como «no encontrado» y no
 * como «no tienes permiso», o revelaría por texto lo que el backend oculta por
 * código de estado.
 */

interface Marco {
  readonly titulo: string;
  readonly descripcion: string;
  readonly icono: ReactNode;
  readonly accion?: ReactNode;
  readonly tono?: 'neutro' | 'aviso' | 'peligro';
  readonly className?: string;
}

const TONOS = {
  neutro: 'text-texto-apagado',
  aviso: 'text-aviso-texto',
  peligro: 'text-peligro-texto',
} as const;

const MarcoDeEstado = ({
  titulo,
  descripcion,
  icono,
  accion,
  tono = 'neutro',
  className,
}: Marco): JSX.Element => (
  <div
    className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}
  >
    <div className={cn('mb-3', TONOS[tono])} aria-hidden="true">
      {icono}
    </div>
    <p className="text-cuerpo font-semibold text-texto">{titulo}</p>
    <p className="mt-1 max-w-sm text-secundario text-texto-apagado">{descripcion}</p>
    {accion !== undefined ? <div className="mt-4">{accion}</div> : null}
  </div>
);

const Icono = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.6">
    {children}
  </svg>
);

/** 1 · VACÍO — copropiedad recién creada, sin datos todavía. */
export const EstadoVacio = ({
  titulo,
  descripcion,
  accion,
}: {
  readonly titulo: string;
  readonly descripcion: string;
  readonly accion?: ReactNode;
}): JSX.Element => (
  <MarcoDeEstado
    titulo={titulo}
    descripcion={descripcion}
    accion={accion}
    icono={
      <Icono>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" strokeLinecap="round" />
      </Icono>
    }
  />
);

/**
 * 2 · CARGANDO — esqueleto, no bloqueo. Un velo sobre toda la pantalla obliga a
 * esperar por la parte más lenta; el esqueleto deja leer lo que ya llegó.
 */
export const Esqueleto = ({ className }: { readonly className?: string }): JSX.Element => (
  <div
    className={cn('animate-pulse rounded-md bg-borde-suave motion-reduce:animate-none', className)}
    aria-hidden="true"
  />
);

export const EstadoCargando = ({ etiqueta }: { readonly etiqueta: string }): JSX.Element => (
  <div className="space-y-3 p-5" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{etiqueta}</span>
    <Esqueleto className="h-4 w-1/3" />
    <Esqueleto className="h-4 w-2/3" />
    <Esqueleto className="h-4 w-1/2" />
  </div>
);

/** 3 · ERROR — con causa y acción de recuperación, nunca «algo salió mal». */
export const EstadoError = ({
  titulo = 'No se pudo cargar',
  descripcion,
  correlacion,
  alReintentar,
}: {
  readonly titulo?: string;
  readonly descripcion: string;
  readonly correlacion?: string | undefined;
  readonly alReintentar?: (() => void) | undefined;
}): JSX.Element => (
  <MarcoDeEstado
    tono="peligro"
    titulo={titulo}
    descripcion={
      correlacion === undefined ? descripcion : `${descripcion} · referencia ${correlacion}`
    }
    icono={
      <Icono>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5M12 16h.01" strokeLinecap="round" />
      </Icono>
    }
    accion={
      alReintentar === undefined ? undefined : (
        <Boton variante="secundario" tamano="sm" onClick={alReintentar}>
          Reintentar
        </Boton>
      )
    }
  />
);

/**
 * 4 · SIN PERMISO — RN-15. La interfaz **oculta, no protege**: el backend ya
 * respondió 403. Esto explica por qué no hay nada que ver, no impide nada.
 */
export const EstadoSinPermiso = ({
  descripcion = 'Tu rol no tiene acceso a esta información. Si crees que debería tenerlo, habla con el administrador de la copropiedad.',
}: {
  readonly descripcion?: string;
}): JSX.Element => (
  <MarcoDeEstado
    tono="aviso"
    titulo="Sin permiso"
    descripcion={descripcion}
    icono={
      <Icono>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </Icono>
    }
  />
);

/**
 * 4-bis · NO ENCONTRADO — el 404 que devuelve un recurso de otra copropiedad.
 * Texto deliberadamente idéntico al de un recurso inexistente: si dijera «no es
 * de tu copropiedad», la consola confirmaría que el identificador existe y
 * desharía la decisión del backend.
 */
export const EstadoNoEncontrado = (): JSX.Element => (
  <MarcoDeEstado
    titulo="No encontrado"
    descripcion="El recurso no existe o ya no está disponible."
    icono={
      <Icono>
        <circle cx="11" cy="11" r="7" />
        <path d="m16.5 16.5 4 4" strokeLinecap="round" />
      </Icono>
    }
  />
);

/** 5 · SIN CONEXIÓN — la API no responde. No es lo mismo que un error de datos. */
export const EstadoSinConexion = ({
  alReintentar,
}: {
  readonly alReintentar?: (() => void) | undefined;
}): JSX.Element => (
  <MarcoDeEstado
    tono="aviso"
    titulo="Sin conexión con el servidor"
    descripcion="La consola no alcanza la API. Los datos que ves pueden estar desactualizados."
    icono={
      <Icono>
        <path
          d="M2 8.8a15 15 0 0 1 20 0M5.5 12.3a10 10 0 0 1 13 0M9 15.8a5 5 0 0 1 6 0"
          strokeLinecap="round"
        />
        <path d="M12 19.5h.01" strokeLinecap="round" />
        <path d="m3 3 18 18" strokeLinecap="round" />
      </Icono>
    }
    accion={
      alReintentar === undefined ? undefined : (
        <Boton variante="secundario" tamano="sm" onClick={alReintentar}>
          Reintentar
        </Boton>
      )
    }
  />
);

/**
 * Selector único: traduce el estado de una consulta al componente que toca.
 *
 * Centralizarlo evita que cada pantalla decida por su cuenta qué significa un
 * 404 —y que alguna lo muestre como «sin permiso», deshaciendo el aislamiento—.
 */
export const estadoSegunCodigo = (
  codigo: number,
  descripcion: string,
  alReintentar?: () => void,
): JSX.Element => {
  if (codigo === 401) {
    return (
      <EstadoError
        titulo="Sesión expirada"
        descripcion="Vuelve a iniciar sesión para continuar."
        alReintentar={alReintentar}
      />
    );
  }
  if (codigo === 403) return <EstadoSinPermiso />;
  if (codigo === 404) return <EstadoNoEncontrado />;
  if (codigo === 503 || codigo === 0) return <EstadoSinConexion alReintentar={alReintentar} />;
  return <EstadoError descripcion={descripcion} alReintentar={alReintentar} />;
};
