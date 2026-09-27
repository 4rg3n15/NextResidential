'use client';

import type { JSX } from 'react';
import { useId } from 'react';
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
 *  · el TOPE de vehículos propios por vivienda (D5 a);
 *  · 15-L (H4) · desde qué IP entran los porteros: el computador de portería y
 *    las permitidas para la guardia remota. Con la lista remota VACÍA, sólo
 *    desde la IP de un superadministrador con sesión abierta.
 *
 * Aparte del formulario para que éste no pase de 300 líneas (§2.3).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface BorradorDePlataforma {
  codigoCorto: string;
  telefonoPorteria: string;
  topeVehiculosPropios: string;
  /** Una IP o red por línea (también se aceptan comas). */
  ipsPorteria: string;
  ipsGuardiaRemota: string;
}

export const ajustesDePlataformaDe = (c: {
  readonly codigoCorto: string | null;
  readonly telefonoPorteria: string | null;
  readonly topeVehiculosPropios: number;
  readonly ipsPorteria: readonly string[];
  readonly ipsGuardiaRemota: readonly string[];
}): BorradorDePlataforma => ({
  codigoCorto: c.codigoCorto ?? '',
  telefonoPorteria: c.telefonoPorteria ?? '',
  topeVehiculosPropios: String(c.topeVehiculosPropios),
  ipsPorteria: c.ipsPorteria.join('\n'),
  ipsGuardiaRemota: c.ipsGuardiaRemota.join('\n'),
});

/** El texto de la caja, en la lista que espera la API. La verdad la valida ella. */
export const listaDeIps = (texto: string): string[] =>
  texto
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter((x) => x !== '');

/** Sólo viaja lo que el rol puede cambiar: lo demás respondería 422. */
export const cuerpoDePlataforma = (
  b: BorradorDePlataforma,
  editable: (clave: string) => boolean,
): {
  codigoCorto?: string;
  telefonoPorteria?: string;
  topeVehiculosPropios?: number;
  ipsPorteria?: string[];
  ipsGuardiaRemota?: string[];
} => ({
  ...(editable('codigoCorto') && b.codigoCorto.trim() !== ''
    ? { codigoCorto: b.codigoCorto.trim() }
    : {}),
  ...(editable('telefonoPorteria') ? { telefonoPorteria: b.telefonoPorteria.trim() } : {}),
  ...(editable('topeVehiculosPropios') && /^\d{1,2}$/.test(b.topeVehiculosPropios)
    ? { topeVehiculosPropios: Number(b.topeVehiculosPropios) }
    : {}),
  ...(editable('ipsPorteria') ? { ipsPorteria: listaDeIps(b.ipsPorteria) } : {}),
  ...(editable('ipsGuardiaRemota') ? { ipsGuardiaRemota: listaDeIps(b.ipsGuardiaRemota) } : {}),
});

/** Una caja de varias líneas con su etiqueta, su ayuda y su error enlazados. */
const CampoDeLista = ({
  etiqueta,
  valor,
  cambiar,
  deshabilitado,
  ayuda,
  error,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly cambiar: (valor: string) => void;
  readonly deshabilitado: boolean;
  readonly ayuda: string;
  readonly error: string | undefined;
}): JSX.Element => {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-etiqueta font-medium text-texto">
        {etiqueta}
      </label>
      <textarea
        id={id}
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        disabled={deshabilitado}
        rows={3}
        spellCheck={false}
        aria-describedby={`${id}-ayuda${error === undefined ? '' : ` ${id}-error`}`}
        aria-invalid={error === undefined ? undefined : true}
        className="w-full rounded-campo border border-borde bg-campo px-3 py-2 font-mono text-secundario text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto disabled:cursor-not-allowed disabled:bg-borde-suave"
      />
      <p id={`${id}-ayuda`} className="text-secundario text-texto-apagado">
        {ayuda}
      </p>
      {error === undefined ? null : (
        <p id={`${id}-error`} className="text-secundario text-peligro-texto">
          {error}
        </p>
      )}
    </div>
  );
};

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
            ? 'De 3 a 8 letras sin tilde o números, único en toda la plataforma. Los residentes entran con este código, su usuario y su contraseña; los porteros, con su número. Cambiarlo obliga a los residentes a usar el nuevo.'
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
      <CampoDeLista
        etiqueta="IP del computador de portería"
        valor={borrador.ipsPorteria}
        cambiar={(v) => cambiar('ipsPorteria', v)}
        deshabilitado={!editable('ipsPorteria')}
        error={rechazos['ipsPorteria']}
        ayuda={
          editable('ipsPorteria')
            ? 'Una IP o red por línea (IPv4, IPv6 o CIDR). Desde aquí el portero usa la consola de portería, pero no la guardia remota.'
            : soloSuperadmin
        }
      />
      <CampoDeLista
        etiqueta="IPs permitidas para conexión remota de porteros"
        valor={borrador.ipsGuardiaRemota}
        cambiar={(v) => cambiar('ipsGuardiaRemota', v)}
        deshabilitado={!editable('ipsGuardiaRemota')}
        error={rechazos['ipsGuardiaRemota']}
        ayuda={
          editable('ipsGuardiaRemota')
            ? 'Una IP o red por línea. Sólo desde ellas un portero hace guardia remota; desde otra verá «No autorizado para guardia remota». Vacía: sólo desde la IP de un superadministrador con sesión abierta.'
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
