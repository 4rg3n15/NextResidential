import type { FaceTemplateProvider } from '@ncr/domain-core';
import {
  PROPOSITOS,
  aplanar,
  cifrar,
  derivarLlave,
  desaplanar,
  descifrar,
} from '../../comun/cripto/sobre-aes-gcm';
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
  private readonly maestra: string;

  constructor(
    llaveSecreta: string,
    private readonly llaveRef: string,
    private readonly almacen: AlmacenDeBytes,
    private readonly terminales: FaceTemplateProvider,
  ) {
    if (llaveSecreta.length < 32) {
      throw new Error('La llave de plantillas biométricas necesita al menos 32 caracteres');
    }
    this.maestra = llaveSecreta;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * H-13-02 · UNA LLAVE POR COPROPIEDAD, DERIVADA CON HKDF.
   *
   * Hasta la ETAPA 13 la llave era `sha256(secreto)`: **una sola para todas las
   * copropiedades**, sin sal y sin separación de dominio. El propio código lo
   * declaraba como paso pendiente (D-41), y una auditoría no hereda un pendiente
   * declarado: lo cierra o lo eleva a hallazgo con severidad. Es hallazgo, y
   * este es su remedio.
   *
   * Qué cambia, y por qué importa con datos biométricos bajo la Ley 1581:
   *
   *  · **Aislamiento por tenant.** Comprometer la llave derivada de una
   *    copropiedad no descifra las plantillas de otra. Antes, una sola llave
   *    abría el conjunto completo — y el aislamiento entre copropiedades es el
   *    riesgo número uno declarado del proyecto (§2.7.6).
   *  · **Separación de dominio.** El `info` de HKDF ata la llave a su propósito:
   *    la misma maestra no produce la misma llave aquí que en cualquier otro uso
   *    futuro del mismo secreto.
   *
   * POR QUÉ HKDF Y NO PBKDF2, scrypt O argon2 — la elección no es de moda. Esas
   * tres son KDF con FACTOR DE TRABAJO, diseñadas para secretos de BAJA entropía
   * (contraseñas humanas) a los que hay que encarecer la fuerza bruta. Aquí la
   * entrada es un secreto de entorno de 32 caracteres o más, de alta entropía:
   * no hay fuerza bruta que encarecer, y un factor de trabajo solo añadiría
   * latencia a cada guardado. HKDF (RFC 5869) es exactamente la primitiva para
   * este caso —extraer y expandir material de clave ya fuerte— y es lo que
   * recomienda ASVS V6 para derivación a partir de llaves, no de contraseñas.
   *
   * La sal es el identificador de la copropiedad. No es secreta y no necesita
   * serlo: en HKDF la sal aporta separación entre derivaciones, no secreto.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  private llaveDe(copropiedadId: string): Buffer {
    return derivarLlave(this.maestra, copropiedadId, PROPOSITOS.plantillas);
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
    // iv ‖ etiqueta ‖ cuerpo: todo lo necesario para descifrar salvo la llave.
    const sobre = aplanar(cifrar(this.llaveDe(copropiedadId), Buffer.from(vector)));
    await this.almacen.poner(this.clave(copropiedadId, plantillaId), sobre);
    return { llaveRef: this.llaveRef, algoritmo: 'AES-256-GCM' };
  }

  /**
   * Privado a propósito: el vector no sale de esta clase. Recibe la copropiedad
   * porque desde H-13-02 la llave se deriva por tenant: descifrar con la de otra
   * falla en `final()`, que es justamente la garantía que se busca.
   */
  private descifrar(copropiedadId: string, sobre: Buffer): Buffer {
    // Si la etiqueta no cuadra, `descifrar` lanza: una plantilla manipulada no
    // se entrega a la terminal, se rechaza.
    return descifrar(this.llaveDe(copropiedadId), desaplanar(sobre));
  }

  async empujarATerminal(
    copropiedadId: string,
    plantillaId: string,
    dispositivoId: string,
  ): Promise<void> {
    const sobre = await this.almacen.tomar(this.clave(copropiedadId, plantillaId));
    if (sobre === null) throw new Error('No hay plantilla que sincronizar: ya fue suprimida');
    const vector = this.descifrar(copropiedadId, sobre);
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
