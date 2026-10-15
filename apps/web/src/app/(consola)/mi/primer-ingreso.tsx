'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { clavesDelResidente } from '@/lib/api/residente';
import { motivoDeFechaDeAdulto } from '@/lib/registro/edad';

/**
 * 15-Y1 · EL PRIMER INGRESO EN LA CONSOLA (D3, ADR-037 §5)
 *
 * La cuenta ya trae su vivienda —la del código de plaza, o la que asignó la
 * administración al titular—: aquí sólo se completa a la PERSONA, con los
 * mismos campos y palabras que la app (`primer_ingreso.dart`): nombres,
 * apellidos, documento de adulto, teléfono, fecha de nacimiento y el correo,
 * opcional. `POST …/mi/alta`, la ruta que ya usa la app; los motivos y sus
 * explicaciones los manda el servidor.
 */
const TIPOS_DE_DOCUMENTO_DE_ADULTO = [
  { valor: 'cedula', etiqueta: 'Cédula de ciudadanía' },
  { valor: 'cedula_extranjeria', etiqueta: 'Cédula de extranjería' },
  { valor: 'pasaporte', etiqueta: 'Pasaporte' },
] as const;
type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO_DE_ADULTO)[number]['valor'];

interface Datos {
  readonly nombres: string;
  readonly apellidos: string;
  readonly tipoDocumento: TipoDeDocumento;
  readonly numeroDocumento: string;
  readonly telefono: string;
  readonly fechaNacimiento: string;
  readonly correo: string;
}
const VACIOS: Datos = {
  nombres: '',
  apellidos: '',
  tipoDocumento: 'cedula',
  numeroDocumento: '',
  telefono: '',
  fechaNacimiento: '',
  correo: '',
};
const TELEFONO = /^\+?[0-9 ]{7,18}$/;

/** Cortesía con las palabras de la app; la verdad la dice el servidor. */
export const motivosLocales = (d: Datos, ahora: Date): Partial<Record<keyof Datos, string>> => {
  const m: Partial<Record<keyof Datos, string>> = {};
  if (d.nombres.trim() === '') m.nombres = 'Escriba sus nombres';
  if (d.apellidos.trim() === '') m.apellidos = 'Escriba sus apellidos';
  if (d.numeroDocumento.trim().length < 4) {
    m.numeroDocumento = 'El documento tiene al menos 4 letras o cifras';
  }
  if (!TELEFONO.test(d.telefono.trim())) m.telefono = 'Escriba un teléfono de 7 a 15 cifras';
  const fecha = motivoDeFechaDeAdulto(d.fechaNacimiento, ahora);
  if (fecha !== null) m.fechaNacimiento = fecha;
  return m;
};

export const PrimerIngreso = ({
  copropiedadId,
  alTerminar,
  ahora = () => new Date(),
}: {
  readonly copropiedadId: string;
  readonly alTerminar: () => void;
  readonly ahora?: () => Date;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [d, setD] = useState<Datos>(VACIOS);
  const [errores, setErrores] = useState<Partial<Record<keyof Datos, string>>>({});
  const [rechazo, setRechazo] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const cambiar = <K extends keyof Datos>(campo: K, valor: Datos[K]): void =>
    setD((previo) => ({ ...previo, [campo]: valor }));

  const enviar = async (): Promise<void> => {
    const locales = motivosLocales(d, ahora());
    setErrores(locales);
    if (Object.keys(locales).length > 0) return;
    setEnviando(true);
    setRechazo(undefined);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/mi/alta', {
          params: { path: { id: copropiedadId } },
          body: {
            nombres: d.nombres.trim(),
            apellidos: d.apellidos.trim(),
            tipoDocumento: d.tipoDocumento,
            numeroDocumento: d.numeroDocumento.trim(),
            telefono: d.telefono.trim(),
            fechaNacimiento: d.fechaNacimiento,
            correo: d.correo.trim() === '' ? null : d.correo.trim(),
          },
        }),
      );
      if (r.vinculada) {
        await consultas.invalidateQueries({ queryKey: clavesDelResidente.raiz(copropiedadId) });
        alTerminar();
        return;
      }
      if (r.campos.length > 0) {
        setErrores(Object.fromEntries(r.campos.map((c) => [c.campo, c.motivo])));
        return;
      }
      setRechazo(r.explicacion ?? 'No se pudo completar el primer ingreso.');
    } catch (fallo: unknown) {
      if (fallo instanceof ErrorDeApi && fallo.porCampo !== undefined) setErrores(fallo.porCampo);
      else if (fallo instanceof ErrorDeApi) setRechazo(fallo.message);
      else setRechazo('Sin conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const campo = (nombre: keyof Datos, etiqueta: string, extra: object = {}) => (
    <Campo
      etiqueta={etiqueta}
      name={nombre}
      value={d[nombre]}
      onChange={(e) => cambiar(nombre, e.target.value as Datos[typeof nombre])}
      error={errores[nombre]}
      {...extra}
    />
  );

  return (
    <Tarjeta>
      <CabeceraDeTarjeta
        titulo="Primer ingreso"
        descripcion="Su cuenta ya tiene vivienda. Complete sus datos para operar: nombres, documento de adulto, teléfono y fecha de nacimiento."
      />
      <CuerpoDeTarjeta>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          {campo('nombres', 'Nombres', { autoComplete: 'given-name', required: true })}
          {campo('apellidos', 'Apellidos', { autoComplete: 'family-name', required: true })}
          <label className="block space-y-1.5">
            <span className="block text-secundario font-medium text-texto">Tipo de documento</span>
            <select
              name="tipoDocumento"
              value={d.tipoDocumento}
              onChange={(e) => cambiar('tipoDocumento', e.target.value as TipoDeDocumento)}
              className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
            >
              {TIPOS_DE_DOCUMENTO_DE_ADULTO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>
          {campo('numeroDocumento', 'Número de documento', { required: true, maxLength: 24 })}
          {campo('telefono', 'Teléfono', {
            type: 'tel',
            autoComplete: 'tel',
            required: true,
            ayuda: 'De 7 a 15 cifras.',
          })}
          {campo('fechaNacimiento', 'Fecha de nacimiento', {
            type: 'date',
            autoComplete: 'bday',
            required: true,
            max: '9999-12-31',
          })}
          {campo('correo', 'Correo de contacto (opcional)', {
            type: 'email',
            autoComplete: 'email',
            ayuda: 'Para que la administración le contacte. No se usa para entrar.',
          })}
          {rechazo === undefined ? null : (
            <p
              role="alert"
              className="rounded-campo bg-peligro-suave px-3 py-2 text-secundario text-peligro-texto"
            >
              {rechazo}
            </p>
          )}
          <Boton type="submit" cargando={enviando}>
            Guardar y continuar
          </Boton>
        </form>
      </CuerpoDeTarjeta>
    </Tarjeta>
  );
};
