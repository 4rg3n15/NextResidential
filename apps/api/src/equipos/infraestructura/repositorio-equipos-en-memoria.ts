import type { ContextoTenant } from '../../autenticacion';
import { PROPOSITOS, cifrar, descifrar, derivarLlave } from '../../comun/cripto/sobre-aes-gcm';
import type {
  AltaDeEquipo,
  DatosDeEquipo,
  EstadoDeVerificacion,
  RepositorioDeEquipos,
  ResultadoDeSondeo,
} from '../aplicacion/puertos';

/**
 * Doble en memoria. Provisional por D-17 —sin contraseña de PostgreSQL la API
 * no se conecta en las pruebas— y **declarado incapaz de demostrar la RLS**:
 * eso se prueba contra base real en `supabase/policies/tests/70_…`.
 *
 * Lo que SÍ demuestra, y por eso existe: que el secreto se cifra al entrar y
 * que no hay ningún camino por el que salga. El sobre se guarda aparte, en un
 * mapa que nadie más lee, exactamente como la tabla que no tiene política de
 * lectura para ningún token de usuario.
 */
export class RepositorioDeEquiposEnMemoria implements RepositorioDeEquipos {
  private readonly equipos = new Map<string, DatosDeEquipo[]>();
  /** Sobres cifrados, por `copropiedad/equipo`. Aquí no hay texto en claro. */
  private readonly sobres = new Map<string, Buffer>();
  /** Lo que se habría escrito en `auditoria_seguridad`, para que la suite mire. */
  readonly auditoria: { copropiedadId: string; actorId: string; recurso: string }[] = [];
  private contador = 0;

  constructor(private readonly llaveMaestra = 'llave-de-pruebas-de-32-caracteres!') {}

  private lista(copropiedadId: string): DatosDeEquipo[] {
    const actual = this.equipos.get(copropiedadId);
    if (actual !== undefined) return actual;
    const nueva: DatosDeEquipo[] = [];
    this.equipos.set(copropiedadId, nueva);
    return nueva;
  }

  private verificacionDe(v: ResultadoDeSondeo): EstadoDeVerificacion {
    return v.verificado ? 'verificado' : v.clase === 'decide_solo' ? 'rechazado' : 'no_verificado';
  }

  private guardarSecreto(copropiedadId: string, equipoId: string, secreto: string): void {
    const llave = derivarLlave(this.llaveMaestra, copropiedadId, PROPOSITOS.credencialesDeEquipo);
    const sobre = cifrar(llave, Buffer.from(secreto, 'utf8'));
    this.sobres.set(
      `${copropiedadId}/${equipoId}`,
      Buffer.concat([sobre.iv, sobre.etiqueta, sobre.cuerpo]),
    );
  }

  /** Solo para que la suite compruebe que hay sobre y que NO es el texto. */
  sobreDe(copropiedadId: string, equipoId: string): Buffer | undefined {
    return this.sobres.get(`${copropiedadId}/${equipoId}`);
  }

  async listar(_ctx: ContextoTenant, copropiedadId: string): Promise<readonly DatosDeEquipo[]> {
    return [...this.lista(copropiedadId)];
  }

  async crear(
    ctx: ContextoTenant,
    copropiedadId: string,
    alta: AltaDeEquipo,
    veredicto: ResultadoDeSondeo,
  ): Promise<DatosDeEquipo> {
    this.contador += 1;
    const equipo: DatosDeEquipo = {
      id: `e0000000-0000-4000-8000-${String(this.contador).padStart(12, '0')}`,
      nombre: alta.nombre,
      tipo: alta.tipo,
      host: alta.host,
      puerto: alta.puerto,
      protocolo: alta.protocolo,
      usuario: alta.usuario,
      modelo: veredicto.modelo ?? alta.modelo ?? null,
      firmware: veredicto.firmware,
      canalBarrera: alta.canalBarrera ?? null,
      numeroDePuerta: alta.numeroDePuerta ?? null,
      canalDeAudio: alta.canalDeAudio ?? null,
      verificacion: this.verificacionDe(veredicto),
      verificadoEn: veredicto.verificado ? new Date(0).toISOString() : null,
      motivoNoVerificado: veredicto.verificado ? null : veredicto.detalle,
      estado: 'activo',
    };
    this.lista(copropiedadId).push(equipo);
    if (alta.secreto !== undefined) this.guardarSecreto(copropiedadId, equipo.id, alta.secreto);
    this.auditoria.push({ copropiedadId, actorId: ctx.usuarioId, recurso: 'equipos/alta' });
    return equipo;
  }

  private reemplazar(
    copropiedadId: string,
    equipoId: string,
    cambio: (actual: DatosDeEquipo) => DatosDeEquipo,
  ): DatosDeEquipo | null {
    const lista = this.lista(copropiedadId);
    const indice = lista.findIndex((e) => e.id === equipoId);
    const actual = lista[indice];
    if (indice < 0 || actual === undefined) return null;
    const nuevo = cambio(actual);
    lista[indice] = nuevo;
    return nuevo;
  }

  async editar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    alta: AltaDeEquipo,
    veredicto: ResultadoDeSondeo,
  ): Promise<DatosDeEquipo | null> {
    const nuevo = this.reemplazar(copropiedadId, equipoId, (actual) => ({
      ...actual,
      nombre: alta.nombre,
      tipo: alta.tipo,
      host: alta.host,
      puerto: alta.puerto,
      protocolo: alta.protocolo,
      usuario: alta.usuario,
      modelo: veredicto.modelo ?? alta.modelo ?? actual.modelo,
      firmware: veredicto.firmware ?? actual.firmware,
      canalBarrera: alta.canalBarrera ?? null,
      numeroDePuerta: alta.numeroDePuerta ?? null,
      canalDeAudio: alta.canalDeAudio ?? null,
      verificacion: this.verificacionDe(veredicto),
      verificadoEn: veredicto.verificado ? new Date(0).toISOString() : null,
      motivoNoVerificado: veredicto.verificado ? null : veredicto.detalle,
    }));
    if (nuevo === null) return null;
    if (alta.secreto !== undefined) this.guardarSecreto(copropiedadId, equipoId, alta.secreto);
    this.auditoria.push({ copropiedadId, actorId: ctx.usuarioId, recurso: 'equipos/edicion' });
    return nuevo;
  }

  async desactivar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    _motivo: string,
  ): Promise<DatosDeEquipo | null> {
    const nuevo = this.reemplazar(copropiedadId, equipoId, (a) => ({ ...a, estado: 'inactivo' }));
    if (nuevo !== null)
      this.auditoria.push({ copropiedadId, actorId: ctx.usuarioId, recurso: 'equipos/baja' });
    return nuevo;
  }

  async reactivar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<DatosDeEquipo | null> {
    const nuevo = this.reemplazar(copropiedadId, equipoId, (a) => ({ ...a, estado: 'activo' }));
    if (nuevo !== null)
      this.auditoria.push({
        copropiedadId,
        actorId: ctx.usuarioId,
        recurso: 'equipos/reactivacion',
      });
    return nuevo;
  }

  /**
   * Descifra el sobre, igual que la versión de PostgreSQL.
   *
   * El doble **no guarda el texto en claro** en ninguna parte: lo cifra al
   * escribirlo y lo descifra aquí, que es lo único que mantiene honesta la
   * prueba de que lo guardado no es la credencial.
   */
  async credencialPara(
    _ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<string | null> {
    const sobre = this.sobres.get(`${copropiedadId}/${equipoId}`);
    if (sobre === undefined) return null;
    const llave = derivarLlave(this.llaveMaestra, copropiedadId, PROPOSITOS.credencialesDeEquipo);
    return descifrar(llave, {
      iv: sobre.subarray(0, 12),
      etiqueta: sobre.subarray(12, 28),
      cuerpo: sobre.subarray(28),
    }).toString('utf8');
  }

  async auditarCorreccion(
    ctx: ContextoTenant,
    copropiedadId: string,
    _detalle: string,
  ): Promise<void> {
    this.auditoria.push({ copropiedadId, actorId: ctx.usuarioId, recurso: 'equipos/correccion' });
  }
}
