/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · D1 · LOS EQUIPOS Y SUS CREDENCIALES, SÓLO AQUÍ Y CIFRADOS
 *
 * Con el Edge como puente (ADR-035), la credencial de cada equipo vive en el
 * conjunto y en ningún otro sitio: la consola la escribe, la API la pasa por
 * el túnel sin guardarla, y el Edge la guarda aquí.
 *
 *  · AES-256-GCM, un IV aleatorio por escritura, y el `dispositivo_id` como
 *    dato asociado: una fila copiada sobre otra no descifra.
 *  · La LLAVE no está en SQLite: llega por `EDGE_EQUIPOS_LLAVE` (variable de
 *    entorno, o el almacén del sistema que la entrega como tal —LoadCredential
 *    de systemd, el llavero del sistema—). Un volcado del fichero sin la llave
 *    es ruido: ni hosts, ni usuarios, ni claves.
 *  · En memoria vive descifrado mientras el proceso vive: es lo que hace falta
 *    para presentarse al equipo, y nunca se registra (RN-21).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EquipoRegistrado, RegistroDeEquipos } from '@ncr/providers';
import type { BaseSqlite } from '../sqlite/motor';

/** Lo que guarda el Edge de un equipo: lo del proveedor y el secreto de su Alarm Server. */
export interface EquipoDelPuente extends EquipoRegistrado {
  readonly secretoAlarmServer?: string;
}

const TABLA = `
CREATE TABLE IF NOT EXISTS equipos_cifrados (
  dispositivo_id TEXT PRIMARY KEY,
  iv             BLOB NOT NULL,
  etiqueta       BLOB NOT NULL,
  cuerpo         BLOB NOT NULL,
  guardado_en    TEXT NOT NULL
);`;

interface Fila {
  readonly dispositivo_id: string;
  readonly iv: Uint8Array;
  readonly etiqueta: Uint8Array;
  readonly cuerpo: Uint8Array;
}

/** `EDGE_EQUIPOS_LLAVE`: 32 bytes en base64. Otra cosa no arranca. */
export const llaveDeEquipos = (base64: string): Buffer => {
  const llave = Buffer.from(base64, 'base64');
  if (llave.length !== 32) throw new Error('EDGE_EQUIPOS_LLAVE debe ser 32 bytes en base64');
  return llave;
};

export class RegistroCifrado implements RegistroDeEquipos {
  private readonly memoria = new Map<string, EquipoDelPuente>();

  constructor(
    private readonly db: BaseSqlite,
    private readonly llave: Buffer,
  ) {
    db.exec(TABLA);
    const filas = db.prepare('SELECT * FROM equipos_cifrados').all() as unknown as Fila[];
    for (const f of filas) {
      try {
        this.memoria.set(f.dispositivo_id, this.descifrar(f));
      } catch {
        // Con otra llave, GCM no autentica: se dice CUÁL variable, no el error genérico.
        throw new Error(
          `El registro cifrado de equipos no se abre con EDGE_EQUIPOS_LLAVE (equipo ` +
            `${f.dispositivo_id}): ¿cambió la llave? Restaure la anterior o vuelva a migrar.`,
        );
      }
    }
  }

  async buscar(dispositivoId: string): Promise<EquipoRegistrado | null> {
    return this.memoria.get(dispositivoId) ?? null;
  }

  /** Los equipos de ESTE Edge (RN-15, segunda barrera del ejecutor). */
  todos(): readonly EquipoDelPuente[] {
    return [...this.memoria.values()];
  }

  guardar(equipo: EquipoDelPuente, ahora: Date): void {
    const iv = randomBytes(12);
    const cifrador = createCipheriv('aes-256-gcm', this.llave, iv);
    cifrador.setAAD(Buffer.from(equipo.dispositivoId));
    const cuerpo = Buffer.concat([
      cifrador.update(JSON.stringify(equipo), 'utf8'),
      cifrador.final(),
    ]);
    this.db
      .prepare(
        `INSERT INTO equipos_cifrados (dispositivo_id, iv, etiqueta, cuerpo, guardado_en)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (dispositivo_id) DO UPDATE SET
           iv = excluded.iv, etiqueta = excluded.etiqueta, cuerpo = excluded.cuerpo,
           guardado_en = excluded.guardado_en`,
      )
      .run(equipo.dispositivoId, iv, cifrador.getAuthTag(), cuerpo, ahora.toISOString());
    this.memoria.set(equipo.dispositivoId, equipo);
  }

  /**
   * Baja del equipo: sale de la base y de la memoria. NO se llama `olvidar`: ese
   * nombre es el del puerto («suelta lo que recuerdas tras una edición») y el
   * proveedor lo invoca solo; aquí borraría la credencial.
   */
  retirar(dispositivoId: string): void {
    this.db.prepare('DELETE FROM equipos_cifrados WHERE dispositivo_id = ?').run(dispositivoId);
    this.memoria.delete(dispositivoId);
  }

  private descifrar(f: Fila): EquipoDelPuente {
    const descifrador = createDecipheriv('aes-256-gcm', this.llave, Buffer.from(f.iv));
    descifrador.setAAD(Buffer.from(f.dispositivo_id));
    descifrador.setAuthTag(Buffer.from(f.etiqueta));
    const claro = Buffer.concat([descifrador.update(Buffer.from(f.cuerpo)), descifrador.final()]);
    return JSON.parse(claro.toString('utf8')) as EquipoDelPuente;
  }
}
