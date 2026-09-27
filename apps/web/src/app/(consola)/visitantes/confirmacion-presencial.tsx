'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Boton } from '@/componentes/ui/boton';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { clavesDeVisitas, useTextoDeLaCasilla } from '@/lib/api/visitas';

const TEXTO_DE_LA_POLITICA =
  'Su rostro se usa únicamente para reconocerlo en los puntos de acceso de la copropiedad ' +
  'mientras dure su visita. La foto se guarda cifrada, se envía sólo a los equipos de acceso ' +
  'y se borra al terminar la visita, o antes si usted lo pide.';

/**
 * CONFIRMACIÓN EN PERSONA, OPCIONAL (15-L, F4).
 *
 * La casilla del formulario ya es la constancia obligatoria. Si el visitante
 * está en la portería y quiere confirmarlo él mismo, escribe SU nombre y SU
 * documento: el sistema los compara con los registrados y el consentimiento
 * pasa a ser suyo. Nunca es un paso obligatorio: sin esto la visita funciona.
 * Al enviarlo el formulario se vacía, para que el documento no quede a la
 * vista del siguiente.
 */
export const ConfirmacionPresencial = ({
  copropiedadId,
  consentimientoId,
  alTerminar,
}: {
  readonly copropiedadId: string;
  readonly consentimientoId: string;
  readonly alTerminar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const casilla = useTextoDeLaCasilla(copropiedadId);
  const [nombreCompleto, setNombre] = useState('');
  const [numeroDocumento, setDocumento] = useState('');
  const [declara, setDeclara] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const version = casilla.data?.version;
  const listo =
    version !== undefined &&
    nombreCompleto.trim().length >= 2 &&
    numeroDocumento.trim().length >= 4 &&
    declara;

  const enviar = async (): Promise<void> => {
    if (!listo) return;
    setOcupado(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST(
          '/copropiedades/{id}/biometria/consentimientos/{consentimientoId}/aceptacion-presencial',
          {
            params: { path: { id: copropiedadId, consentimientoId } },
            body: {
              nombreCompleto,
              numeroDocumento,
              versionPolitica: version,
              aceptaPolitica: true,
            },
          },
        ),
      );
      setNombre('');
      setDocumento('');
      setDeclara(false);
      await consultas.invalidateQueries({ queryKey: clavesDeVisitas.raiz(copropiedadId) });
      alTerminar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <form
      aria-label="Confirmación en persona del visitante"
      className="space-y-2 rounded-md border border-borde p-3 text-secundario"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <p className="font-medium text-texto">Para el visitante: llénelo usted mismo.</p>
      <p className="text-texto-apagado">{TEXTO_DE_LA_POLITICA}</p>
      <label className="block">
        <span>Su nombre completo</span>
        <input
          value={nombreCompleto}
          onChange={(e) => setNombre(e.target.value)}
          autoComplete="off"
          maxLength={200}
          className="mt-1 block w-full rounded-campo border border-borde bg-campo px-2 py-1"
        />
      </label>
      <label className="block">
        <span>Su número de documento</span>
        <input
          value={numeroDocumento}
          onChange={(e) => setDocumento(e.target.value)}
          autoComplete="off"
          maxLength={30}
          className="mt-1 block w-full rounded-campo border border-borde bg-campo px-2 py-1"
        />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={declara} onChange={(e) => setDeclara(e.target.checked)} />
        <span>Soy la persona de la foto y autorizo su uso para el ingreso.</span>
      </label>
      {error !== undefined ? (
        <p role="alert" className="text-peligro-texto">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Boton type="submit" tamano="sm" disabled={!listo || ocupado}>
          Confirmar
        </Boton>
        <Boton type="button" variante="secundario" tamano="sm" onClick={alTerminar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
};
