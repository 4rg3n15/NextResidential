import type { JSX, ReactNode } from 'react';
import { useId } from 'react';
import { Lock } from 'lucide-react';

/**
 * Ajuste que se VE y no se edita — y no por rol: por restricción de base.
 *
 * No es un `<input disabled>`, y la diferencia no es estética. Un campo
 * deshabilitado dice «alguien con más permiso podría abrirlo», y eso fue
 * exactamente lo que la ayuda anterior afirmaba del umbral de confianza
 * («exclusivo del superadministrador») sin que fuera verdad: nadie lo edita
 * desde ninguna pantalla, lo fija una restricción `CHECK` (migración 0032) y
 * cambiarlo exige una migración. Un campo bloqueado invita a pedir un permiso
 * que no existe; un bloque de lectura con el motivo al lado cierra la
 * pregunta.
 *
 * Es un grupo con nombre y descripción asociados por id: un lector de pantalla
 * anuncia la etiqueta, después el valor y después el motivo, en ese orden. Los
 * identificadores salen de `useId` para que dos bloques en la misma página no
 * colisionen, igual que hace `Campo`.
 */
export const AjusteFijo = ({
  etiqueta,
  valor,
  motivo,
}: {
  readonly etiqueta: string;
  readonly valor: ReactNode;
  readonly motivo: string;
}): JSX.Element => {
  const id = useId();
  const idEtiqueta = `${id}-etiqueta`;
  const idMotivo = `${id}-motivo`;

  return (
    <div
      role="group"
      aria-labelledby={idEtiqueta}
      aria-describedby={idMotivo}
      className="space-y-1.5"
    >
      <p
        id={idEtiqueta}
        className="flex items-center gap-1.5 text-secundario font-medium text-texto"
      >
        {etiqueta}
        <Lock
          className="h-3.5 w-3.5 shrink-0 text-texto-apagado"
          aria-hidden="true"
          strokeWidth={2}
        />
        <span className="sr-only">· solo lectura</span>
      </p>
      {/* Con borde discontinuo a propósito: se lee como dato fijado, no como
          campo que esté esperando a que alguien lo desbloquee. */}
      <p className="flex min-h-11 w-full items-center rounded-campo border border-dashed border-borde bg-borde-suave px-3 py-2 text-cuerpo text-texto">
        {valor}
      </p>
      <p id={idMotivo} className="text-secundario text-texto-apagado">
        {motivo}
      </p>
    </div>
  );
};
