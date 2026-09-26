import { createHmac, timingSafeEqual } from 'node:crypto';
import { codigoDesdeBytes } from '@ncr/domain-core';
import { PROPOSITOS, derivarLlave } from '../../comun/cripto/sobre-aes-gcm';
import type { CodigosDeOcupante, PlazaDeOcupante } from '../aplicacion/puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL CÓDIGO DE OCUPANTE · DERIVADO, NO GUARDADO (ADR-025)
 *
 * HMAC-SHA256 de `plaza:generación` bajo la llave de la copropiedad para este
 * propósito (HKDF de la maestra, como el código de patrullaje, S-48). Así:
 *
 *  · se puede CONSULTAR siempre —el residente lo ve en su perfil, el
 *    superadministrador en la consola— sin que exista en ninguna tabla: una
 *    copia de la base no trae ni un código;
 *  · deja de valer en cuanto la plaza se libera: la generación sube y el HMAC
 *    cambia;
 *  · no hace falta una llave nueva en `.env`: se deriva de la maestra ya
 *    declarada, con su propio propósito, y rotar la maestra rota los códigos
 *    libres (los usados ya no sirven para nada).
 *
 * 40 bits: un billón de combinaciones contra un límite de 5 intentos cada 15
 * minutos por cuenta. La comparación recorre TODAS las plazas y compara en
 * tiempo constante: el tiempo de respuesta no dice cuántas hay ni cuál casi era.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class CodigosDeOcupanteHmac implements CodigosDeOcupante {
  constructor(private readonly llaveMaestra: string) {}

  codigoDe(copropiedadId: string, plazaId: string, generacion: number): string {
    const llave = derivarLlave(this.llaveMaestra, copropiedadId, PROPOSITOS.codigoDeOcupante);
    const resumen = createHmac('sha256', llave)
      .update(`${plazaId}:${String(generacion)}`)
      .digest();
    return codigoDesdeBytes(new Uint8Array(resumen.subarray(0, 5)));
  }

  plazaDelCodigo(
    copropiedadId: string,
    plazas: readonly PlazaDeOcupante[],
    codigo: string,
  ): PlazaDeOcupante | null {
    const buscado = Buffer.from(codigo.padEnd(8, '\0').slice(0, 8), 'utf8');
    let hallada: PlazaDeOcupante | null = null;
    for (const p of plazas) {
      const propio = Buffer.from(this.codigoDe(copropiedadId, p.id, p.generacion), 'utf8');
      const coincide = propio.length === buscado.length && timingSafeEqual(propio, buscado);
      if (coincide && hallada === null) hallada = p;
    }
    return hallada;
  }
}
