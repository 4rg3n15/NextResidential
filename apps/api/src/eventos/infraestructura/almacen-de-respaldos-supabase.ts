import type { AlmacenDeRespaldos } from '../aplicacion/respaldo/puertos';

/**
 * D-147 · EL BUCKET PRIVADO `respaldo-de-eventos`, POR LA API REST DE STORAGE
 *
 * El mismo patrón que la evidencia (`evidencia-supabase.ts`): la llave secreta
 * sólo en el servidor, lectura autenticada y URLs firmadas de vida corta
 * (RN-21). El bucket y sus políticas los crea la migración 0061; la API no los
 * crea ni los cambia.
 *
 * `x-upsert: true` a propósito: si una ejecución murió entre subir el fichero
 * y registrar la fila, la siguiente lo vuelve a subir en la misma ruta. Lo que
 * NUNCA se reescribe es un día ya registrado: el caso de uso no llega aquí si
 * la fila existe.
 */
export const BUCKET_DE_RESPALDOS = 'respaldo-de-eventos';

export class ErrorDeRespaldo extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeRespaldo';
  }
}

export class AlmacenDeRespaldosSupabase implements AlmacenDeRespaldos {
  constructor(
    private readonly opciones: {
      readonly supabaseUrl: string;
      readonly llaveSecreta: string;
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

  private url(tramo: 'object' | 'object/authenticated' | 'object/sign', ruta: string): string {
    const segmentos = ruta.split('/').map(encodeURIComponent).join('/');
    return `${this.opciones.supabaseUrl}/storage/v1/${tramo}/${BUCKET_DE_RESPALDOS}/${segmentos}`;
  }

  private static async detalle(respuesta: Response): Promise<string> {
    const crudo = await respuesta.text().catch(() => '');
    const limpio = crudo.replace(/\s+/g, ' ').trim();
    return limpio === ''
      ? String(respuesta.status)
      : `${respuesta.status} · ${limpio.slice(0, 200)}`;
  }

  async guardar(ruta: string, contenido: Uint8Array): Promise<void> {
    const respuesta = await this.pedir(this.url('object', ruta), {
      method: 'POST',
      headers: {
        ...this.cabeceras,
        'Content-Type': 'application/vnd.ms-excel',
        'x-upsert': 'true',
      },
      body: Buffer.from(contenido),
    });
    if (!respuesta.ok) {
      throw new ErrorDeRespaldo(
        `no se pudo guardar el respaldo: ${await AlmacenDeRespaldosSupabase.detalle(respuesta)}`,
      );
    }
  }

  async leer(ruta: string): Promise<Uint8Array | null> {
    const respuesta = await this.pedir(this.url('object/authenticated', ruta), {
      method: 'GET',
      headers: this.cabeceras,
    });
    if (respuesta.status === 404 || respuesta.status === 400) return null;
    if (!respuesta.ok) {
      throw new ErrorDeRespaldo(
        `no se pudo leer el respaldo: ${await AlmacenDeRespaldosSupabase.detalle(respuesta)}`,
      );
    }
    return new Uint8Array(await respuesta.arrayBuffer());
  }

  async urlFirmada(ruta: string, segundosDeVida: number): Promise<string> {
    const respuesta = await this.pedir(this.url('object/sign', ruta), {
      method: 'POST',
      headers: { ...this.cabeceras, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: segundosDeVida }),
    });
    if (!respuesta.ok) {
      throw new ErrorDeRespaldo(
        `no se pudo firmar el respaldo: ${await AlmacenDeRespaldosSupabase.detalle(respuesta)}`,
      );
    }
    const cuerpo: unknown = await respuesta.json();
    const firmada =
      typeof cuerpo === 'object' && cuerpo !== null
        ? (cuerpo as { signedURL?: unknown }).signedURL
        : undefined;
    if (typeof firmada !== 'string' || firmada === '') {
      throw new ErrorDeRespaldo('Storage respondió sin `signedURL`');
    }
    // `download` hace que Storage responda con `Content-Disposition: attachment`:
    // el navegador guarda el .xls con su nombre en vez de pintar el XML.
    const url = new URL(`${this.opciones.supabaseUrl}/storage/v1${firmada}`);
    url.searchParams.set('download', ruta.split('/').at(-1) ?? 'eventos.xls');
    return url.toString();
  }
}
