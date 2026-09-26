'use client';

import type { JSX } from 'react';
import { Campo } from '@/componentes/ui/campo';
import { AjusteFijo } from './ajuste-fijo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * AJUSTES DE PLATAFORMA · ETAPA 15-I (D1, D5, D7)
 *
 * Tres campos que sólo el SUPERADMINISTRADOR cambia —la API lo decide con
 * `editables` y lo repite la base frente a la REST— y uno que no cambia nadie
 * todavía (la aprobación de terceros, D5 c):
 *
 *  · el CÓDIGO corto con el que porteros y residentes entran (D1);
 *  · el TELÉFONO de portería al que llama el botón de la app (D7);
 *  · el TOPE de vehículos propios por vivienda (D5 a).
 *
 * Aparte del formulario para que éste no pase de 300 líneas (§2.3).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface BorradorDePlataforma {
  codigoCorto: string;
  telefonoPorteria: string;
  topeVehiculosPropios: string;
}

export const ajustesDePlataformaDe = (c: {
  readonly codigoCorto: string | null;
  readonly telefonoPorteria: string | null;
  readonly topeVehiculosPropios: number;
}): BorradorDePlataforma => ({
  codigoCorto: c.codigoCorto ?? '',
  telefonoPorteria: c.telefonoPorteria ?? '',
  topeVehiculosPropios: String(c.topeVehiculosPropios),
});

/** Sólo viaja lo que el rol puede cambiar: lo demás respondería 422. */
export const cuerpoDePlataforma = (
  b: BorradorDePlataforma,
  editable: (clave: string) => boolean,
): { codigoCorto?: string; telefonoPorteria?: string; topeVehiculosPropios?: number } => ({
  ...(editable('codigoCorto') && b.codigoCorto.trim() !== ''
    ? { codigoCorto: b.codigoCorto.trim() }
    : {}),
  ...(editable('telefonoPorteria') ? { telefonoPorteria: b.telefonoPorteria.trim() } : {}),
  ...(editable('topeVehiculosPropios') && /^\d{1,2}$/.test(b.topeVehiculosPropios)
    ? { topeVehiculosPropios: Number(b.topeVehiculosPropios) }
    : {}),
});

export const AjustesDePlataforma = ({
  borrador,
  cambiar,
  editable,
  rechazos,
}: {
  readonly borrador: BorradorDePlataforma;
  readonly cambiar: (campo: keyof BorradorDePlataforma, valor: string) => void;
  readonly editable: (clave: string) => boolean;
  readonly rechazos: Readonly<Record<string, string>>;
}): JSX.Element => {
  const soloSuperadmin = 'Lo cambia sólo el superadministrador.';
  return (
    <>
      <Campo
        etiqueta="Código de acceso de la copropiedad"
        value={borrador.codigoCorto}
        onChange={(e) => cambiar('codigoCorto', e.target.value.toUpperCase())}
        disabled={!editable('codigoCorto')}
        maxLength={8}
        autoCapitalize="characters"
        spellCheck={false}
        error={rechazos['codigoCorto']}
        ayuda={
          editable('codigoCorto')
            ? 'De 3 a 8 letras sin tilde o números, único en toda la plataforma. Porteros y residentes entran con este código, su usuario y su contraseña. Cambiarlo obliga a todos a usar el nuevo.'
            : soloSuperadmin
        }
      />
      <Campo
        etiqueta="Teléfono de portería"
        value={borrador.telefonoPorteria}
        onChange={(e) => cambiar('telefonoPorteria', e.target.value)}
        disabled={!editable('telefonoPorteria')}
        inputMode="tel"
        maxLength={24}
        error={rechazos['telefonoPorteria']}
        ayuda={
          editable('telefonoPorteria')
            ? 'El botón «Portería» de la app del residente llama a este número. Vacío, la app avisa de que no está registrado.'
            : soloSuperadmin
        }
      />
      <Campo
        etiqueta="Vehículos propios por vivienda"
        value={borrador.topeVehiculosPropios}
        onChange={(e) => cambiar('topeVehiculosPropios', e.target.value)}
        disabled={!editable('topeVehiculosPropios')}
        inputMode="numeric"
        maxLength={2}
        error={rechazos['topeVehiculosPropios']}
        ayuda={
          editable('topeVehiculosPropios')
            ? 'Cuántos vehículos activos pueden registrar los ocupantes de una vivienda desde la app (2 por omisión). Los que registra el superadministrador no cuentan.'
            : soloSuperadmin
        }
      />
      <AjusteFijo
        etiqueta="Aprobación de vehículos de terceros"
        valor={<span>Automática</span>}
        motivo="La autorización de un tercero se aprueba al crearse y sólo deja pasar en su día y franja. El modo «aprobación del portero» existe como punto de extensión (ADR-027) y no está activado."
      />
    </>
  );
};
