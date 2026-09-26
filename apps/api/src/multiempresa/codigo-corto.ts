import { exito, fallo } from '@ncr/domain-core';
import type { Resultado } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CÓDIGO CORTO DE LA COPROPIEDAD · objeto de valor (D1, ETAPA 15-I)
 *
 * La otra mitad del identificador de acceso, junto al usuario: «MIRA» +
 * «porteria1». Es público —se dice en la garita y se imprime en el manual del
 * residente— y por eso no es un secreto ni un factor: sólo dice EN QUÉ conjunto
 * buscar la cuenta, igual que el NIT (C-34), que sigue valiendo en la consola.
 *
 * Se normaliza al construir, como `Placa` y `NombreDeUsuario` (§2.4): sin
 * invisibles, NFKC (un «Ｍ» de ancho completo es una «M») y en MAYÚSCULAS. La
 * base guarda sólo la forma normalizada (`copropiedades_codigo_corto_formato`)
 * y la unicidad es de TODA la plataforma (`copropiedades_codigo_corto_uk`): así
 * «mira», «Mira» y «MIRA» son el mismo código al escribirlo Y al buscarlo.
 *
 * Vive en `multiempresa` y no en `cuentas` porque es un atributo de la
 * copropiedad: lo asigna la configuración y lo consulta el acceso.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type CodigoCorto = string & { readonly __marca: 'CodigoCorto' };

export const CODIGO_MINIMO = 3;
export const CODIGO_MAXIMO = 8;
const FORMATO = /^[A-Z0-9]{3,8}$/;
const INVISIBLES =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\s]/g;

export const codigoCorto = (bruto: string): Resultado<CodigoCorto, string> => {
  const limpio = bruto.normalize('NFKC').replace(INVISIBLES, '').toUpperCase();
  return FORMATO.test(limpio)
    ? exito(limpio as CodigoCorto)
    : fallo(
        `El código de la copropiedad tiene de ${CODIGO_MINIMO} a ${CODIGO_MAXIMO} letras sin tilde o números`,
      );
};
