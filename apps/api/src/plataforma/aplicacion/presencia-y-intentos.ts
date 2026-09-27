import type { ModoPruebas } from './modo-pruebas';
import type { RegistroDePresencia, RegistroDeSeguridad } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H4 b (15-L) · DESDE DÓNDE ESTÁ CONECTADO EL SUPERADMINISTRADOR
 *
 * Al iniciar sesión y en cada petición suya (como mucho una escritura por
 * minuto y sesión): con la lista remota vacía, un portero puede entrar desde
 * esa misma IP. Al cerrar sesión deja de contar.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const INTERVALO_DE_PRESENCIA_MS = 60_000;

export class PresenciaDeSuperadministrador {
  private readonly ultimas = new Map<string, number>();

  constructor(
    private readonly registro: RegistroDePresencia,
    private readonly ahoraMs: () => number = () => Date.now(),
  ) {}

  async anotar(sesionId: string, usuarioId: string, ip: string): Promise<void> {
    const ahora = this.ahoraMs();
    const clave = `${sesionId}|${ip}`;
    if (ahora - (this.ultimas.get(clave) ?? -Infinity) < INTERVALO_DE_PRESENCIA_MS) return;
    this.ultimas.set(clave, ahora);
    await this.registro.anotar({ sesionId, usuarioId, ip, ahora: new Date(ahora) });
  }

  async cerrar(sesionId: string): Promise<void> {
    for (const clave of this.ultimas.keys()) {
      if (clave.startsWith(`${sesionId}|`)) this.ultimas.delete(clave);
    }
    await this.registro.cerrar(sesionId, new Date(this.ahoraMs()));
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H5 (15-L) · BLOQUEO TEMPORAL POR (IP, IDENTIFICADOR), NUNCA POR IDENTIFICADOR
 *
 * Contar por identificador a secas dejaría a cualquiera bloquear a un portero
 * a propósito tecleando mal su número. Cada fallo va a `auditoria_seguridad`
 * (`login_fallido`) y de ahí se cuenta: el rastro y el contador son la misma
 * fila. Con el modo pruebas activo se registra, pero no se bloquea.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const MAXIMO_DE_FALLOS = 5;
export const VENTANA_DE_BLOQUEO_MS = 5 * 60_000;

export class IntentosDeAcceso {
  constructor(
    private readonly seguridad: RegistroDeSeguridad,
    private readonly modo: ModoPruebas,
    private readonly ahoraMs: () => number = () => Date.now(),
  ) {}

  async bloqueado(ip: string | null, identificador: string): Promise<boolean> {
    if (ip === null || (await this.modo.activo())) return false;
    const desde = new Date(this.ahoraMs() - VENTANA_DE_BLOQUEO_MS);
    return (await this.seguridad.fallosRecientes(ip, identificador, desde)) >= MAXIMO_DE_FALLOS;
  }

  anotarFallo(ip: string | null, identificador: string, agente: string | null): Promise<void> {
    return this.seguridad.registrar({
      ocurridoEn: new Date(this.ahoraMs()),
      tipo: 'login_fallido',
      copropiedadId: null,
      usuarioId: null,
      recurso: 'auth/acceso',
      identificador,
      ip,
      agente,
      resultado: '401',
    });
  }
}
