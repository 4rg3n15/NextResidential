import type { AlmacenEvidencia } from '@ncr/domain-core';
import type { LectorDeFotosDeVisita } from '../aplicacion/puertos';

interface ConLectura {
  leer(clave: string): Promise<Uint8Array | null>;
}

const lee = (a: AlmacenEvidencia): a is AlmacenEvidencia & ConLectura =>
  typeof (a as Partial<ConLectura>).leer === 'function';

/**
 * F6 (15-L) · la lectura de una foto guardada. La ofrecen los dos almacenes de
 * evidencia del proyecto (el firmado provisional y el bucket privado de
 * Supabase); el puerto del dominio no la declara porque ninguna otra
 * superficie debe leer evidencia en bytes. Un almacén sin lectura responde
 * «no hay foto» y «Volver a autorizar» pide una nueva: denegar por defecto.
 */
export const lectorDeFotosDesde = (almacen: AlmacenEvidencia): LectorDeFotosDeVisita =>
  lee(almacen) ? { leer: (clave) => almacen.leer(clave) } : { leer: async () => null };
