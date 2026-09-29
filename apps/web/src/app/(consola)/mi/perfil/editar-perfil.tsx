'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { Campo } from '@/componentes/ui/campo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import type { PerfilDelResidente } from '@/lib/api/residente';

export const TIPOS_DE_DOCUMENTO = [
  { valor: 'cedula', etiqueta: 'Cédula de ciudadanía' },
  { valor: 'cedula_extranjeria', etiqueta: 'Cédula de extranjería' },
  { valor: 'pasaporte', etiqueta: 'Pasaporte' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const;
type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number]['valor'];

const esTipo = (v: string | null): v is TipoDeDocumento =>
  TIPOS_DE_DOCUMENTO.some((t) => t.valor === v);

interface Datos {
  readonly nombres: string;
  readonly apellidos: string;
  readonly fechaNacimiento: string;
  readonly tipoDocumento: TipoDeDocumento;
  readonly numeroDocumento: string;
  readonly correo: string;
  readonly telefono: string;
}

const datosDe = (p: PerfilDelResidente): Datos => ({
  nombres: p.nombres ?? '',
  apellidos: p.apellidos ?? '',
  fechaNacimiento: p.fechaNacimiento ?? '',
  tipoDocumento: esTipo(p.tipoDocumento) ? p.tipoDocumento : 'cedula',
  numeroDocumento: p.numeroDocumento ?? '',
  correo: p.correo ?? '',
  telefono: p.telefono ?? '',
});

const TELEFONO = /^\+?[0-9 ]{7,18}$/;

/**
 * M-8 · «Mis datos», los mismos campos y las mismas comprobaciones que la
 * app: nombres, apellidos, fecha de nacimiento opcional, documento, correo y
 * teléfono de CONTACTO (no de acceso). La API devuelve los rechazos por campo
 * y aquí se ponen debajo del campo que los produjo.
 */
export const EditarPerfil = ({
  copropiedadId,
  perfil,
  alCerrar,
  alGuardar,
}: {
  readonly copropiedadId: string;
  readonly perfil: PerfilDelResidente | null;
  readonly alCerrar: () => void;
  readonly alGuardar: () => void;
}): JSX.Element => {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const d = datos ?? (perfil === null ? null : datosDe(perfil));

  const cambiar = <K extends keyof Datos>(clave: K, valor: Datos[K]): void => {
    if (d === null) return;
    setDatos({ ...d, [clave]: valor });
  };

  const completo =
    d !== null &&
    d.nombres.trim() !== '' &&
    d.apellidos.trim() !== '' &&
    d.numeroDocumento.trim() !== '' &&
    d.correo.includes('@') &&
    TELEFONO.test(d.telefono.trim()) &&
    (d.fechaNacimiento === '' || /^\d{4}-\d{2}-\d{2}$/.test(d.fechaNacimiento));

  const cerrar = (): void => {
    setDatos(null);
    setErrores({});
    setError(undefined);
    alCerrar();
  };

  const guardar = async (): Promise<void> => {
    if (d === null || !completo) return;
    setEnviando(true);
    setError(undefined);
    setErrores({});
    try {
      const r = desenvolver(
        await cliente.PUT('/copropiedades/{id}/mi/perfil', {
          params: { path: { id: copropiedadId } },
          body: {
            nombres: d.nombres.trim(),
            apellidos: d.apellidos.trim(),
            fechaNacimiento: d.fechaNacimiento === '' ? null : d.fechaNacimiento,
            tipoDocumento: d.tipoDocumento,
            numeroDocumento: d.numeroDocumento.trim(),
            correo: d.correo.trim(),
            telefono: d.telefono.trim(),
          },
        }),
      );
      if (!r.guardado) {
        const porCampo = Object.fromEntries(r.campos.map((c) => [c.campo, c.motivo]));
        setErrores(porCampo);
        if (r.campos.length === 0) {
          setError(
            r.motivo === 'DOCUMENTO_EN_USO'
              ? 'Ese documento ya está registrado a nombre de otra persona.'
              : 'No se pudo guardar el perfil.',
          );
        }
        return;
      }
      setDatos(null);
      alGuardar();
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
      abierto={perfil !== null}
      titulo="Mis datos"
      descripcion="El correo y el teléfono son de contacto: la administración te escribe ahí. No se usan para entrar."
      etiquetaEnviar={enviando ? 'Guardando…' : 'Guardar'}
      enviando={enviando}
      error={error}
      puedeEnviar={completo && !enviando}
      alEnviar={() => void guardar()}
      alCancelar={cerrar}
    >
      {d !== null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Nombres"
            name="nombres"
            required
            autoComplete="given-name"
            value={d.nombres}
            onChange={(e) => cambiar('nombres', e.target.value)}
            error={errores.nombres}
          />
          <Campo
            etiqueta="Apellidos"
            name="apellidos"
            required
            autoComplete="family-name"
            value={d.apellidos}
            onChange={(e) => cambiar('apellidos', e.target.value)}
            error={errores.apellidos}
          />
          <Campo
            etiqueta="Fecha de nacimiento (opcional)"
            name="fechaNacimiento"
            type="date"
            value={d.fechaNacimiento}
            onChange={(e) => cambiar('fechaNacimiento', e.target.value)}
            error={errores.fechaNacimiento}
          />
          <label className="block space-y-1.5">
            <span className="block text-secundario font-medium text-texto">Tipo de documento</span>
            <select
              name="tipoDocumento"
              value={d.tipoDocumento}
              onChange={(e) => cambiar('tipoDocumento', e.target.value as TipoDeDocumento)}
              className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
            >
              {TIPOS_DE_DOCUMENTO.map((t) => (
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
            value={d.numeroDocumento}
            onChange={(e) => cambiar('numeroDocumento', e.target.value)}
            error={errores.numeroDocumento}
          />
          <Campo
            etiqueta="Correo de contacto"
            name="correo"
            type="email"
            required
            autoComplete="email"
            value={d.correo}
            onChange={(e) => cambiar('correo', e.target.value)}
            error={errores.correo}
            ayuda="Para que la administración te contacte. No se usa para entrar."
          />
          <Campo
            etiqueta="Teléfono"
            name="telefono"
            type="tel"
            required
            autoComplete="tel"
            value={d.telefono}
            onChange={(e) => cambiar('telefono', e.target.value)}
            error={errores.telefono}
            ayuda="De 7 a 15 cifras."
          />
        </div>
      ) : null}
    </DialogoDeFormulario>
  );
};
