import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import type { FaceTemplateProvider } from '@ncr/domain-core';
import type { BovedaDePlantillas } from '../aplicacion/puertos';

/**
 * Bóveda de plantillas: **AES-256-GCM, cifrado en la APLICACIÓN**.
 *
 * Por qué aquí y no con `pgcrypto` (decisión D-10 de la ETAPA 01): si la llave
 * vive en la base, quien lee la base lee la llave, y el cifrado deja de proteger
 * de la fuga que importa —el volcado de la base—. Cifrando en la aplicación, un
 * volcado entrega `bytea` sin sentido.
 *
 * GCM y no CBC porque el vector cifrado necesita ser **autenticado**: sin
 * etiqueta de integridad, alguien con escritura en la base podría sustituir la
 * plantilla de un visitante por la suya y la terminal lo aceptaría sin
 * pestañear. El cifrado protegería la confidencialidad y no la identidad, que
 * en control de acceso es justo lo que hay que proteger.
 *
 * **Lo que esta clase no ofrece: leer.** No hay `descifrar()` público. El vector
 * se descifra dentro de `empujarATerminal` y va directo al proveedor de
 * hardware. Es la traducción en código de «la plantilla vive en la terminal y
 * cifrada en base, nunca en el cliente»: para llevarla al cliente habría que
 * añadir un método, no simplemente llamar a uno que ya existe.
 *
 * La llave llega por variable de entorno y se guarda **su referencia**, nunca
 * su valor (`plantillas_llave_es_referencia` de la migración 0008).
 */
const ALGORITMO = 'aes-256-gcm';
const LONGITUD_IV = 12;
const LONGITUD_ETIQUETA = 16;

export interface AlmacenDeBytes {
  poner(clave: string, datos: Buffer): Promise<void>;
  tomar(clave: string): Promise<Buffer | null>;
  quitar(clave: string): Promise<void>;
}

/** Almacén en memoria: el adaptador PostgreSQL llega con la credencial (D-17). */
export class AlmacenEnMemoria implements AlmacenDeBytes {
  private readonly datos = new Map<string, Buffer>();
  async poner(clave: string, datos: Buffer): Promise<void> {
    this.datos.set(clave, datos);
  }
  async tomar(clave: string): Promise<Buffer | null> {
    return this.datos.get(clave) ?? null;
  }
  async quitar(clave: string): Promise<void> {
    this.datos.delete(clave);
  }
}

export class BovedaAesGcm implements BovedaDePlantillas {
  private readonly llave: Buffer;

  constructor(
    llaveSecreta: string,
    private readonly llaveRef: string,
    private readonly almacen: AlmacenDeBytes,
    private readonly terminales: FaceTemplateProvider,
  ) {
    if (llaveSecreta.length < 32) {
      throw new Error('La llave de plantillas biométricas necesita al menos 32 caracteres');
    }
    // Derivación determinista de 32 bytes. Una KDF con sal por copropiedad es
    // lo correcto y llega con la bóveda real; aquí se declara el paso en vez de
    // pasarlo por alto en silencio.
    this.llave = createHash('sha256').update(llaveSecreta).digest();
  }

  private clave(copropiedadId: string, plantillaId: string): string {
    return `${copropiedadId}/${plantillaId}`;
  }

  async guardar(
    copropiedadId: string,
    plantillaId: string,
    vector: Uint8Array,
  ): Promise<{ llaveRef: string; algoritmo: string }> {
    if (vector.length === 0) {
      throw new Error('No se cifra una plantilla vacía: sería una plantilla inservible cifrada');
    }
    const iv = randomBytes(LONGITUD_IV);
    const cifrador = createCipheriv(ALGORITMO, this.llave, iv);
    const cuerpo = Buffer.concat([cifrador.update(Buffer.from(vector)), cifrador.final()]);
    // iv ‖ etiqueta ‖ cuerpo: todo lo necesario para descifrar salvo la llave.
    const sobre = Buffer.concat([iv, cifrador.getAuthTag(), cuerpo]);
    await this.almacen.poner(this.clave(copropiedadId, plantillaId), sobre);
    return { llaveRef: this.llaveRef, algoritmo: 'AES-256-GCM' };
  }

  /** Privado a propósito: el vector no sale de esta clase. */
  private descifrar(sobre: Buffer): Buffer {
    const iv = sobre.subarray(0, LONGITUD_IV);
    const etiqueta = sobre.subarray(LONGITUD_IV, LONGITUD_IV + LONGITUD_ETIQUETA);
    const cuerpo = sobre.subarray(LONGITUD_IV + LONGITUD_ETIQUETA);
    const descifrador = createDecipheriv(ALGORITMO, this.llave, iv);
    descifrador.setAuthTag(etiqueta);
    // `final()` lanza si la etiqueta no cuadra: una plantilla manipulada no se
    // entrega a la terminal, se rechaza.
    return Buffer.concat([descifrador.update(cuerpo), descifrador.final()]);
  }

  async empujarATerminal(
    copropiedadId: string,
    plantillaId: string,
    dispositivoId: string,
  ): Promise<void> {
    const sobre = await this.almacen.tomar(this.clave(copropiedadId, plantillaId));
    if (sobre === null) throw new Error('No hay plantilla que sincronizar: ya fue suprimida');
    const vector = this.descifrar(sobre);
    try {
      await this.terminales.sincronizar(dispositivoId, plantillaId, new Uint8Array(vector));
    } finally {
      // El claro no sobrevive a la llamada ni siquiera en memoria.
      vector.fill(0);
    }
  }

  async retirarDeTerminal(plantillaId: string, dispositivoId: string): Promise<void> {
    await this.terminales.suprimir(dispositivoId, plantillaId);
  }

  async olvidar(copropiedadId: string, plantillaId: string): Promise<void> {
    await this.almacen.quitar(this.clave(copropiedadId, plantillaId));
  }
}
