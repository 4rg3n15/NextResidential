import { MENSAJE_GUARDIA_REMOTA, evaluarIpDePortero } from './politica-de-ip';
import type { ModoPruebas } from './modo-pruebas';
import type {
  RegistroDePresencia,
  RegistroDeSeguridad,
  ReglasDeIp,
  RepositorioDeReglasDeIp,
} from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H4 · H5 (15-L) · LA REGLA DE IP DEL PORTERO, EN EL INICIO DE SESIÓN Y EN
 * CADA PETICIÓN
 *
 * Quitar una IP de la lista corta las sesiones abiertas desde ella porque se
 * evalúa en cada petición; las reglas se releen cada pocos segundos, así que
 * el corte llega en ese plazo, sin reiniciar.
 *
 * Con el MODO PRUEBAS activo, lo que se habría rechazado entra y queda en
 * `auditoria_seguridad` como «habría sido rechazado» —una vez cada pocos
 * minutos por portero, IP y recurso: sin eso, cada petición de la consola
 * sería una fila—.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const VIGENCIA_DE_REGLAS_MS = 5000;
/** Una sesión de superadministrador sin actividad en este tiempo ya no cuenta (H4 b). */
export const VENTANA_DE_SESION_ACTIVA_MS = 30 * 60_000;
const INTERVALO_DE_AVISO_MS = 5 * 60_000;

export interface PeticionDePortero {
  readonly copropiedadId: string;
  readonly usuarioId: string;
  readonly ip: string | null;
  readonly agente: string | null;
  /** Sólo guardia remota: la IP de portería no basta. */
  readonly soloRemota: boolean;
  /** Qué se pidió, para el rastro. */
  readonly recurso: string;
}

export type VeredictoDeOrigen =
  | { readonly permitido: true; readonly habriaSidoRechazado: boolean }
  | { readonly permitido: false; readonly mensaje: string };

export class ControlDeIpDePorteros {
  private readonly reglas = new Map<
    string,
    { readonly valor: ReglasDeIp; readonly enMs: number }
  >();
  private readonly avisados = new Map<string, number>();

  constructor(
    private readonly repositorio: RepositorioDeReglasDeIp,
    private readonly presencia: RegistroDePresencia,
    private readonly modo: ModoPruebas,
    private readonly seguridad: RegistroDeSeguridad,
    private readonly ahoraMs: () => number = () => Date.now(),
  ) {}

  async evaluar(p: PeticionDePortero): Promise<VeredictoDeOrigen> {
    const ahora = this.ahoraMs();
    const [reglas, ipsDeSuperadministrador] = await Promise.all([
      this.reglasDe(p.copropiedadId, ahora),
      this.presencia.ipsActivas(new Date(ahora - VENTANA_DE_SESION_ACTIVA_MS)),
    ]);
    const v = evaluarIpDePortero({
      ip: p.ip,
      reglas,
      ipsDeSuperadministrador,
      soloRemota: p.soloRemota,
    });
    if (v.permitido) return { permitido: true, habriaSidoRechazado: false };

    if (await this.modo.activo()) {
      const clave = `${p.usuarioId}|${p.ip ?? '-'}|${p.soloRemota ? 'remota' : 'general'}`;
      if (ahora - (this.avisados.get(clave) ?? -Infinity) >= INTERVALO_DE_AVISO_MS) {
        this.avisados.set(clave, ahora);
        await this.registrar(p, `${p.recurso} · habría sido rechazado (modo pruebas)`, 'permitido');
      }
      return { permitido: true, habriaSidoRechazado: true };
    }
    await this.registrar(p, p.recurso, '403');
    return { permitido: false, mensaje: MENSAJE_GUARDIA_REMOTA };
  }

  private async reglasDe(copropiedadId: string, ahora: number): Promise<ReglasDeIp> {
    const guardadas = this.reglas.get(copropiedadId);
    if (guardadas !== undefined && ahora - guardadas.enMs < VIGENCIA_DE_REGLAS_MS) {
      return guardadas.valor;
    }
    const valor = await this.repositorio.de(copropiedadId);
    this.reglas.set(copropiedadId, { valor, enMs: ahora });
    return valor;
  }

  private registrar(p: PeticionDePortero, recurso: string, resultado: '403' | 'permitido') {
    return this.seguridad.registrar({
      ocurridoEn: new Date(this.ahoraMs()),
      tipo: 'restriccion_de_ip',
      copropiedadId: p.copropiedadId,
      usuarioId: p.usuarioId,
      recurso,
      identificador: null,
      ip: p.ip,
      agente: p.agente,
      resultado,
    });
  }
}
