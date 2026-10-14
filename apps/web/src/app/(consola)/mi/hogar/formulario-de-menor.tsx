'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { Campo } from '@/componentes/ui/campo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import type { MenorDelHogar, PlazaDeOcupante } from '@/lib/api/residente';
import {
  DOCUMENTO_MINIMO_DE_MENOR,
  TIPOS_DE_DOCUMENTO_DE_MENOR,
  documentoLegibleDeMenor,
} from '@/lib/hogar';
import type { TipoDeDocumentoDeMenor } from '@/lib/hogar';
import { motivoDeFechaDeMenor } from '@/lib/registro/edad';

const CLASE_DE_SELECT =
  'h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto';

interface Datos {
  readonly nombres: string;
  readonly apellidos: string;
  readonly fechaNacimiento: string;
  readonly parentesco: string;
  readonly tipoDocumento: TipoDeDocumentoDeMenor;
  readonly numeroDocumento: string;
  readonly plazaId: string;
}

const inicial = (menor: MenorDelHogar | null, libres: readonly PlazaDeOcupante[]): Datos => ({
  nombres: menor?.nombres ?? '',
  apellidos: menor?.apellidos ?? '',
  fechaNacimiento: menor?.fechaNacimiento ?? '',
  parentesco: menor?.parentesco ?? '',
  tipoDocumento: 'tarjeta_identidad',
  numeroDocumento: '',
  plazaId: libres[0]?.id ?? '',
});

/** Lo que la app muestra debajo del documento mientras está corto. */
export const MOTIVO_DE_DOCUMENTO_CORTO = 'El documento tiene al menos 4 letras o cifras';

/**
 * 15-Y2 · registrar o editar a un menor del hogar, como en la app (D-W2, D4):
 * al registrarlo se elige una plaza LIBRE y su documento de menor; al editarlo
 * sólo cambian nombres, apellidos, fecha y parentesco, porque el documento y
 * la plaza no se reescriben desde aquí. La fecha tiene la misma cortesía que
 * la app (`motivoDeFechaDeMenor`); el servidor decide con el día de Bogotá.
 */
export const FormularioDeMenor = ({
  copropiedadId,
  abierto,
  menor,
  libres,
  ahora,
  alCerrar,
  alGuardar,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  /** `null` registra uno nuevo. */
  readonly menor: MenorDelHogar | null;
  readonly libres: readonly PlazaDeOcupante[];
  readonly ahora: Date;
  readonly alCerrar: () => void;
  readonly alGuardar: (mensaje: string) => void;
}): JSX.Element => {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const nuevo = menor === null;
  const d = datos ?? inicial(menor, libres);
  const cambiar = <K extends keyof Datos>(clave: K, valor: Datos[K]): void =>
    setDatos({ ...d, [clave]: valor });

  const motivoDeFecha = motivoDeFechaDeMenor(d.fechaNacimiento, ahora);
  const documentoCorto = d.numeroDocumento.trim().length < DOCUMENTO_MINIMO_DE_MENOR;
  const completo =
    d.nombres.trim() !== '' &&
    d.apellidos.trim() !== '' &&
    motivoDeFecha === null &&
    d.parentesco.trim() !== '' &&
    (!nuevo || (!documentoCorto && d.plazaId !== ''));

  const cerrar = (): void => {
    setDatos(null);
    setErrores({});
    setError(undefined);
    alCerrar();
  };

  const guardar = async (): Promise<void> => {
    if (!completo) return;
    setEnviando(true);
    setError(undefined);
    setErrores({});
    const comunes = {
      nombres: d.nombres.trim(),
      apellidos: d.apellidos.trim(),
      fechaNacimiento: d.fechaNacimiento.trim(),
      parentesco: d.parentesco.trim(),
    };
    try {
      if (menor === null) {
        desenvolver(
          await cliente.POST('/copropiedades/{id}/mi/menores', {
            params: { path: { id: copropiedadId } },
            body: {
              ...comunes,
              tipoDocumento: d.tipoDocumento,
              numeroDocumento: d.numeroDocumento.trim(),
              plazaId: d.plazaId,
            },
          }),
        );
      } else {
        desenvolver(
          await cliente.PUT('/copropiedades/{id}/mi/menores/{residenteId}', {
            params: { path: { id: copropiedadId, residenteId: menor.residenteId } },
            body: comunes,
          }),
        );
      }
      setDatos(null);
      alGuardar(menor === null ? 'Menor registrado en su plaza.' : 'Datos guardados.');
      alCerrar();
    } catch (fallo) {
      if (fallo instanceof ErrorDeApi && fallo.porCampo !== undefined) setErrores(fallo.porCampo);
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo={nuevo ? 'Añadir menor' : 'Editar menor'}
      descripcion={
        menor === null
          ? 'Los menores de edad no tienen cuenta: ocupan una plaza libre de su vivienda.'
          : documentoLegibleDeMenor(menor)
      }
      etiquetaEnviar={enviando ? 'Guardando…' : nuevo ? 'Registrar' : 'Guardar'}
      enviando={enviando}
      error={error}
      puedeEnviar={completo && !enviando}
      alEnviar={() => void guardar()}
      alCancelar={cerrar}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Nombres"
          name="nombres"
          required
          maxLength={100}
          autoComplete="off"
          value={d.nombres}
          onChange={(e) => cambiar('nombres', e.target.value)}
          error={errores.nombres}
        />
        <Campo
          etiqueta="Apellidos"
          name="apellidos"
          required
          maxLength={100}
          autoComplete="off"
          value={d.apellidos}
          onChange={(e) => cambiar('apellidos', e.target.value)}
          error={errores.apellidos}
        />
        <Campo
          etiqueta="Fecha de nacimiento"
          name="fechaNacimiento"
          type="date"
          required
          value={d.fechaNacimiento}
          onChange={(e) => cambiar('fechaNacimiento', e.target.value)}
          error={
            errores.fechaNacimiento ??
            (d.fechaNacimiento === '' ? undefined : (motivoDeFecha ?? undefined))
          }
        />
        <Campo
          etiqueta="Parentesco (hija, sobrino…)"
          name="parentesco"
          required
          maxLength={60}
          value={d.parentesco}
          onChange={(e) => cambiar('parentesco', e.target.value)}
          error={errores.parentesco}
        />
        {nuevo ? (
          <>
            <label className="block space-y-1.5">
              <span className="block text-secundario font-medium text-texto">
                Tipo de documento
              </span>
              <select
                name="tipoDocumento"
                value={d.tipoDocumento}
                onChange={(e) => cambiar('tipoDocumento', e.target.value as TipoDeDocumentoDeMenor)}
                className={CLASE_DE_SELECT}
              >
                {TIPOS_DE_DOCUMENTO_DE_MENOR.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <Campo
              etiqueta="Número de documento"
              name="numeroDocumento"
              required
              maxLength={24}
              autoComplete="off"
              value={d.numeroDocumento}
              onChange={(e) => cambiar('numeroDocumento', e.target.value)}
              error={
                errores.numeroDocumento ??
                (d.numeroDocumento !== '' && documentoCorto ? MOTIVO_DE_DOCUMENTO_CORTO : undefined)
              }
            />
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="block text-secundario font-medium text-texto">Plaza libre</span>
              <select
                name="plazaId"
                required
                value={d.plazaId}
                onChange={(e) => cambiar('plazaId', e.target.value)}
                className={CLASE_DE_SELECT}
              >
                {libres.length === 0 ? <option value="">Elija una plaza libre</option> : null}
                {libres.map((p) => (
                  <option key={p.id} value={p.id}>
                    Plaza {p.numero}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>
    </DialogoDeFormulario>
  );
};
