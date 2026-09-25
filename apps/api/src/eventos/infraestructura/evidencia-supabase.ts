import type { AlmacenEvidencia, Bitacora } from '@ncr/domain-core';
import { tipoRealDe } from '../../comun/archivos/tipo-real';

/**
 * Evidencia en el **bucket privado de Supabase Storage** — RN-21, §2.7.8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ENTRA ANTES DE LA ETAPA 10
 *
 * Hasta aquí el almacén cableado guardaba los bytes en un `Map` del proceso.
 * Funciona, se prueba, y tiene dos consecuencias que la consola de portería
 * convierte en un fallo visible: al reiniciar la API **toda la evidencia
 * desaparece** —la fila de `eventos` sobrevive, porque es append-only, y apunta
 * a un objeto que ya no existe— y con más de un proceso sólo la ve el que la
 * recibió. El portero abre el evento y encuentra una imagen rota.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE **NO** CAMBIA, Y ES LO IMPORTANTE
 *
 * El puerto `AlmacenEvidencia` es el mismo de la ETAPA 06. Este fichero es un
 * adaptador nuevo detrás de un contrato estable: no toca dominio, ni
 * aplicación, ni interfaz. Es exactamente lo que ADR-03 dice que debe costar
 * cambiar de infraestructura, y el hecho de que cueste esto es la prueba.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRES DECISIONES
 *
 * 1. **La URL se firma en cada lectura, nunca se guarda.** La tabla `evidencias`
 *    almacena `bucket`, `ruta` y `hash_sha256` y jamás una URL (D-19):
 *    persistir una URL firmada convierte un permiso temporal en un dato
 *    permanente, y una fuga de la tabla sería una fuga de las fotos.
 * 2. **El tipo se valida por CONTENIDO, no por extensión** (§2.7.8). Se
 *    comprueban los bytes de cabecera antes de subir: una extensión mentida es
 *    el camino clásico para colar un fichero que el navegador ejecuta.
 * 3. **`upsert: false`.** Una clave de evidencia se escribe una vez. Permitir
 *    la sobrescritura dejaría reemplazar la foto que sustentó una decisión ya
 *    registrada, y eso deshace por Storage lo que RN-03 garantiza en la base.
 */

/**
 * El tipo real se decide en `comun/archivos/tipo-real.ts` desde la 15-D: la
 * fotografía del visitante usa la MISMA función. Se reexporta para que las
 * pruebas de este adaptador sigan hablando con él.
 */
export { tipoRealDe };

export class ErrorDeEvidencia extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeEvidencia';
  }
}

export class AlmacenEvidenciaSupabase implements AlmacenEvidencia {
  constructor(
    private readonly opciones: {
      readonly supabaseUrl: string;
      readonly llaveSecreta: string;
      readonly bucket: string;
      readonly bitacora?: Bitacora;
      readonly pedir?: typeof fetch;
    },
  ) {}

  private get pedir(): typeof fetch {
    return this.opciones.pedir ?? fetch;
  }

  private get cabeceras(): Record<string, string> {
    return {
      apikey: this.opciones.llaveSecreta,
      Authorization: `Bearer ${this.opciones.llaveSecreta}`,
    };
  }

  private ruta(clave: string): string {
    const { supabaseUrl, bucket } = this.opciones;
    // Se codifica cada segmento por separado: la clave lleva `/` a propósito
    // —`copropiedad/evento/foto.jpg`— y codificarla entera los destruiría.
    const segmentos = clave.split('/').map(encodeURIComponent).join('/');
    return `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${segmentos}`;
  }

  /** El cuerpo del error de Storage, que es donde vive el motivo real. */
  private static async detalle(respuesta: Response): Promise<string> {
    const crudo = await respuesta.text().catch(() => '');
    const limpio = crudo.replace(/\s+/g, ' ').trim();
    return limpio === ''
      ? String(respuesta.status)
      : `${respuesta.status} · ${limpio.slice(0, 200)}`;
  }

  async guardar(clave: string, contenido: Uint8Array, tipoMime: string): Promise<string> {
    const real = tipoRealDe(contenido);
    if (real === null) {
      throw new ErrorDeEvidencia(
        'el contenido no es JPEG ni PNG según sus bytes de cabecera (§2.7.8: tipo real, no extensión)',
      );
    }
    if (real !== tipoMime) {
      // No se «corrige» en silencio: que el declarado y el real discrepen es
      // una señal, y tragársela es cómo se cuela un fichero disfrazado.
      throw new ErrorDeEvidencia(
        `el tipo declarado (${tipoMime}) no coincide con el real (${real})`,
      );
    }

    const respuesta = await this.pedir(this.ruta(clave), {
      method: 'POST',
      headers: { ...this.cabeceras, 'Content-Type': real, 'x-upsert': 'false' },
      // `Buffer` desde `Uint8Array`: `undici` acepta vistas de ArrayBuffer, y así
      // no hace falta el tipo global `BodyInit`, que no está en este tsconfig.
      body: Buffer.from(contenido),
    });
    if (!respuesta.ok) {
      throw new ErrorDeEvidencia(
        `no se pudo guardar la evidencia: ${await AlmacenEvidenciaSupabase.detalle(respuesta)}`,
      );
    }
    // Se devuelve la CLAVE, no una URL: es lo que la tabla `evidencias` guarda.
    return clave;
  }

  async urlFirmada(clave: string, segundosDeVida: number): Promise<string> {
    const { supabaseUrl, bucket } = this.opciones;
    const segmentos = clave.split('/').map(encodeURIComponent).join('/');
    const respuesta = await this.pedir(
      `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${segmentos}`,
      {
        method: 'POST',
        headers: { ...this.cabeceras, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: segundosDeVida }),
      },
    );
    if (!respuesta.ok) {
      throw new ErrorDeEvidencia(
        `no se pudo firmar la evidencia: ${await AlmacenEvidenciaSupabase.detalle(respuesta)}`,
      );
    }
    const cuerpo: unknown = await respuesta.json();
    const firmada =
      typeof cuerpo === 'object' && cuerpo !== null
        ? (cuerpo as { signedURL?: unknown }).signedURL
        : undefined;
    if (typeof firmada !== 'string' || firmada === '') {
      throw new ErrorDeEvidencia('Storage respondió sin `signedURL`');
    }
    return `${supabaseUrl}/storage/v1${firmada}`;
  }
}
