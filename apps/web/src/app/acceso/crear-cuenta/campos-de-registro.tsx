'use client';

import type { JSX } from 'react';
import { Campo } from '@/componentes/ui/campo';
import { RequisitosDeContrasena } from '../requisitos-contrasena';

/** Los seis campos de D-W8, en el orden y con las ayudas de la app. */
export type CampoDeRegistro =
  | 'usuario'
  | 'correo'
  | 'contrasena'
  | 'confirmacion'
  | 'codigoDeInvitacion'
  | 'fechaNacimiento';

export type ValoresDeRegistro = Readonly<Record<CampoDeRegistro, string>>;

export const VALORES_VACIOS: ValoresDeRegistro = {
  usuario: '',
  correo: '',
  contrasena: '',
  confirmacion: '',
  codigoDeInvitacion: '',
  fechaNacimiento: '',
};

export const CamposDeRegistro = ({
  valores,
  errores,
  alCambiar,
  alSalir,
}: {
  readonly valores: ValoresDeRegistro;
  readonly errores: Readonly<Partial<Record<CampoDeRegistro, string>>>;
  readonly alCambiar: (campo: CampoDeRegistro, valor: string) => void;
  readonly alSalir: (campo: CampoDeRegistro) => void;
}): JSX.Element => {
  const de = (campo: CampoDeRegistro) => ({
    name: campo,
    value: valores[campo],
    error: errores[campo],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => alCambiar(campo, e.target.value),
    onBlur: () => alSalir(campo),
    required: true,
  });
  return (
    <div className="space-y-4">
      <Campo etiqueta="Usuario" autoComplete="username" maxLength={32} {...de('usuario')} />
      <Campo
        etiqueta="Correo de contacto"
        type="email"
        autoComplete="email"
        maxLength={254}
        ayuda="Para que la administración le contacte. No se usa para entrar."
        {...de('correo')}
      />
      <Campo
        etiqueta="Contraseña"
        type="password"
        autoComplete="new-password"
        maxLength={256}
        aria-describedby="requisitos-registro"
        {...de('contrasena')}
      />
      <RequisitosDeContrasena contrasena={valores.contrasena} id="requisitos-registro" />
      <Campo
        etiqueta="Confirme la contraseña"
        type="password"
        autoComplete="new-password"
        maxLength={256}
        {...de('confirmacion')}
      />
      <Campo
        etiqueta="Código de invitación"
        autoComplete="off"
        maxLength={40}
        placeholder="MIRA-K7PQ-2XWZ"
        ayuda="Pídaselo al titular de su vivienda: lo ve en Ocupantes"
        {...de('codigoDeInvitacion')}
      />
      <Campo
        etiqueta="Fecha de nacimiento"
        type="date"
        autoComplete="bday"
        max="9999-12-31"
        {...de('fechaNacimiento')}
      />
    </div>
  );
};
