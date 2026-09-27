/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-14 · EL FLUJO DE EVENTOS ES `multipart`, CON FOTOS DENTRO
 *
 * La guía de la terminal («Event Uploading»): el enlace de armado —con o sin
 * suscripción— entrega partes separadas por un `boundary`, cada una con su
 * `Content-Type` y su `Content-Length`: `<SubscribeEventResponse/>`, el evento
 * (XML o JSON según el equipo) o el latido, **y los bytes de la foto**.
 *
 * El analizador anterior buscaba objetos JSON contando llaves sobre el TEXTO
 * decodificado. Una foto de 90 KB trae cientos de bytes `{`, `}` y `"`: bastaba
 * una para dejar el contador descuadrado y tragarse los eventos siguientes sin
 * una sola línea en la bitácora. Aquí se corta por partes, en BYTES, y la
 * longitud declarada manda sobre cualquier cosa que haya dentro.
 *
 * Si el equipo no manda `multipart` —un simulado, un firmware que vuelca JSON
 * seguido— se cae al extractor de objetos de antes, que para eso sigue siendo
 * correcto.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { extraerObjetos } from './extraer-objetos';

export interface ParteDelFlujo {
  /** `Content-Type` de la parte, en minúsculas y sin parámetros. */
  readonly tipo: string;
  readonly bytes: Uint8Array;
}

const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);
const LFLF = new Uint8Array([10, 10]);

const buscar = (pajar: Uint8Array, aguja: Uint8Array, desde = 0): number => {
  outer: for (let i = desde; i <= pajar.length - aguja.length; i += 1) {
    for (let j = 0; j < aguja.length; j += 1) {
      if (pajar[i + j] !== aguja[j]) continue outer;
    }
    return i;
  }
  return -1;
};

const unir = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  if (a.length === 0) return b;
  const r = new Uint8Array(a.length + b.length);
  r.set(a, 0);
  r.set(b, a.length);
  return r;
};

/** El `boundary` de una cabecera `Content-Type`, o `null` si no es multipart. */
export const boundaryDe = (tipo: string | null): string | null => {
  if (tipo === null || !/multipart\//i.test(tipo)) return null;
  const m = /boundary\s*=\s*"?([^";\s]+)"?/i.exec(tipo);
  return m?.[1] ?? null;
};

const decodificador = new TextDecoder();

/**
 * Corta un flujo `multipart` en partes. Se alimenta con trozos tal como
 * llegan; devuelve las partes completas y guarda el resto para la siguiente.
 */
export class LectorMultipart {
  private acumulado = new Uint8Array(0);
  private readonly delimitador: Uint8Array;

  constructor(boundary: string) {
    this.delimitador = new TextEncoder().encode(`--${boundary}`);
  }

  alimentar(trozo: Uint8Array): ParteDelFlujo[] {
    this.acumulado = unir(this.acumulado, trozo);
    const partes: ParteDelFlujo[] = [];
    for (;;) {
      const inicio = buscar(this.acumulado, this.delimitador);
      if (inicio === -1) return partes;
      const trasDelimitador = inicio + this.delimitador.length;
      // `--boundary--` es el cierre: no hay más partes.
      if (this.acumulado[trasDelimitador] === 45 && this.acumulado[trasDelimitador + 1] === 45) {
        this.acumulado = this.acumulado.subarray(trasDelimitador + 2);
        continue;
      }
      const conCrlf = buscar(this.acumulado, CRLFCRLF, trasDelimitador);
      const conLf = buscar(this.acumulado, LFLF, trasDelimitador);
      const finDeCabeceras =
        conCrlf === -1 ? conLf : conLf === -1 ? conCrlf : Math.min(conCrlf, conLf);
      if (finDeCabeceras === -1) return partes;
      const separador = finDeCabeceras === conCrlf ? CRLFCRLF.length : LFLF.length;
      const cabeceras = decodificador.decode(
        this.acumulado.subarray(trasDelimitador, finDeCabeceras),
      );
      const tipo = (/content-type\s*:\s*([^;\r\n]+)/i.exec(cabeceras)?.[1] ?? 'desconocido')
        .trim()
        .toLowerCase();
      const longitud = /content-length\s*:\s*(\d+)/i.exec(cabeceras)?.[1];
      const cuerpoDesde = finDeCabeceras + separador;

      let cuerpoHasta: number;
      if (longitud !== undefined) {
        // La longitud DECLARADA manda: dentro de una foto puede haber cualquier
        // secuencia de bytes, también una que se parezca al delimitador.
        cuerpoHasta = cuerpoDesde + Number(longitud);
        if (this.acumulado.length < cuerpoHasta) return partes;
      } else {
        const siguiente = buscar(this.acumulado, this.delimitador, cuerpoDesde);
        if (siguiente === -1) return partes;
        cuerpoHasta = siguiente;
      }
      const cuerpo = this.acumulado.slice(cuerpoDesde, cuerpoHasta);
      partes.push({ tipo, bytes: recortarSaltos(cuerpo) });
      this.acumulado = this.acumulado.subarray(cuerpoHasta);
    }
  }

  /** Bytes que esperan al siguiente trozo. Para el diagnóstico. */
  get pendientes(): number {
    return this.acumulado.length;
  }
}

/** Sin el salto de línea que precede al siguiente delimitador. */
const recortarSaltos = (b: Uint8Array): Uint8Array => {
  let fin = b.length;
  while (fin > 0 && (b[fin - 1] === 10 || b[fin - 1] === 13)) fin -= 1;
  return fin === b.length ? b : b.subarray(0, fin);
};

/**
 * Lector para un flujo que NO es multipart: JSON seguido. Conserva el
 * comportamiento anterior, texto y llaves, que es correcto sin binarios.
 */
export class LectorDeJsonSeguido {
  private resto = '';
  private readonly texto = new TextDecoder();

  alimentar(trozo: Uint8Array): ParteDelFlujo[] {
    const { objetos, resto } = extraerObjetos(
      this.resto + this.texto.decode(trozo, { stream: true }),
    );
    this.resto = resto;
    const codificador = new TextEncoder();
    return objetos.map((o) => ({ tipo: 'application/json', bytes: codificador.encode(o) }));
  }

  get pendientes(): number {
    return this.resto.length;
  }
}

export const lectorPara = (
  tipoDeRespuesta: string | null,
): LectorMultipart | LectorDeJsonSeguido => {
  const boundary = boundaryDe(tipoDeRespuesta);
  return boundary === null ? new LectorDeJsonSeguido() : new LectorMultipart(boundary);
};
