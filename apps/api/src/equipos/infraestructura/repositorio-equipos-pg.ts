import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { ContextoTenant } from '../../autenticacion';
import { PROPOSITOS, cifrar, descifrar, derivarLlave } from '../../comun/cripto/sobre-aes-gcm';
import type {
  AltaDeEquipo,
  DatosDeEquipo,
  EstadoDeVerificacion,
  ProtocoloDeEquipo,
  RepositorioDeEquipos,
  ResultadoDeSondeo,
  TipoDeEquipo,
} from '../aplicacion/puertos';

/**
 * Equipos en PostgreSQL — A.1 y A.2.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TRES COSAS EN UNA SOLA TRANSACCIÓN, Y NO ES CELO
 *
 * El alta escribe la fila del equipo, el sobre cifrado con su secreto y el
 * rastro en `auditoria_seguridad`. Los tres van juntos:
 *
 *  · Si el sobre se escribiera aparte, una caída dejaría un equipo registrado
 *    **sin credencial** y el sistema intentaría hablar con él para siempre.
 *  · Si el rastro se escribiera después, una caída dejaría un cambio de
 *    configuración de seguridad sin constancia, que es exactamente la ventana
 *    que §2.7.8 prohíbe.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL SECRETO NO SALE DE AQUÍ
 *
 * Ninguna consulta de este fichero selecciona `credenciales_de_equipo`. Las
 * columnas se enumeran una a una, jamás `*`: es lo que mantiene el sobre fuera
 * del proceso. Quien necesita el secreto es el adaptador que va a hablar con el
 * equipo, y lo pide por su propio camino.
 */

interface FilaDeEquipo {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoDeEquipo;
  readonly host: string;
  readonly puerto: number;
  readonly protocolo: ProtocoloDeEquipo;
  readonly usuario: string | null;
  readonly modelo: string | null;
  readonly firmware: string | null;
  readonly canal_barrera: number | null;
  readonly numero_de_puerta: number | null;
  readonly canal_de_audio: number | null;
  readonly verificacion: EstadoDeVerificacion;
  readonly verificado_en: Date | null;
  readonly motivo_no_verificado: string | null;
  readonly estado: 'activo' | 'inactivo';
}

const CAMPOS = `
  id, nombre, tipo::text AS tipo, host, puerto, protocolo::text AS protocolo, usuario,
  modelo, firmware, canal_barrera, numero_de_puerta, canal_de_audio,
  verificacion::text AS verificacion, verificado_en, motivo_no_verificado,
  estado::text AS estado`;

const aDatos = (f: FilaDeEquipo): DatosDeEquipo => ({
  id: f.id,
  nombre: f.nombre,
  tipo: f.tipo,
  host: f.host,
  puerto: Number(f.puerto),
  protocolo: f.protocolo,
  usuario: f.usuario,
  modelo: f.modelo,
  firmware: f.firmware,
  canalBarrera: f.canal_barrera,
  numeroDePuerta: f.numero_de_puerta,
  canalDeAudio: f.canal_de_audio,
  verificacion: f.verificacion,
  verificadoEn: f.verificado_en === null ? null : f.verificado_en.toISOString(),
  motivoNoVerificado: f.motivo_no_verificado,
  estado: f.estado,
});

const verificacionDe = (v: ResultadoDeSondeo): EstadoDeVerificacion =>
  v.verificado ? 'verificado' : v.clase === 'decide_solo' ? 'rechazado' : 'no_verificado';

@Injectable()
export class RepositorioDeEquiposPg implements RepositorioDeEquipos {
  constructor(
    private readonly pool: Pool,
    private readonly llaveMaestra: string,
    private readonly llaveRef: string,
  ) {}

  private claims(ctx: ContextoTenant): Record<string, unknown> {
    return {
      rol: ctx.rol,
      usuario_id: ctx.usuarioId,
      copropiedad_id: ctx.copropiedadId,
      copropiedades: ctx.copropiedadesAtendidas,
    };
  }

  private async conCliente<T>(ctx: ContextoTenant, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims(ctx)),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  async listar(ctx: ContextoTenant, copropiedadId: string): Promise<readonly DatosDeEquipo[]> {
    return this.conCliente(ctx, async (c) => {
      const { rows } = await c.query<FilaDeEquipo>(
        `SELECT ${CAMPOS} FROM public.dispositivos
          WHERE copropiedad_id = $1 ORDER BY estado, nombre`,
        [copropiedadId],
      );
      return rows.map(aDatos);
    });
  }

  /** El sobre. Se arma aquí y se escribe dentro de la misma transacción. */
  private sobreDe(copropiedadId: string, secreto: string): [Buffer, Buffer, Buffer] {
    const llave = derivarLlave(this.llaveMaestra, copropiedadId, PROPOSITOS.credencialesDeEquipo);
    const sobre = cifrar(llave, Buffer.from(secreto, 'utf8'));
    return [sobre.iv, sobre.cuerpo, sobre.etiqueta];
  }

  private async auditar(
    c: PoolClient,
    copropiedadId: string,
    actorId: string,
    recurso: string,
    identificador: string,
  ): Promise<void> {
    await c.query(
      `INSERT INTO public.auditoria_seguridad
         (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
          identificador_solicitado, resultado, creado_por)
       VALUES ($1, $1, $2, 'cambio_configuracion', $3, $4, 'permitido', $2)`,
      [copropiedadId, actorId, recurso, identificador],
    );
  }

  private async guardarSecreto(
    c: PoolClient,
    copropiedadId: string,
    actorId: string,
    equipoId: string,
    secreto: string,
  ): Promise<void> {
    // Rotar es DESACTIVAR la anterior y escribir la nueva, nunca sustituir: el
    // índice único parcial exige que solo haya una activa, y el historial de
    // rotación se conserva.
    await c.query(
      `UPDATE public.credenciales_de_equipo
          SET estado = 'inactivo', desactivado_en = now(), actualizado_por = $3
        WHERE copropiedad_id = $1 AND dispositivo_id = $2 AND estado = 'activo'`,
      [copropiedadId, equipoId, actorId],
    );
    const [iv, cuerpo, etiqueta] = this.sobreDe(copropiedadId, secreto);
    await c.query(
      `INSERT INTO public.credenciales_de_equipo
         (copropiedad_id, dispositivo_id, iv, cuerpo, etiqueta, llave_ref,
          creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [copropiedadId, equipoId, iv, cuerpo, etiqueta, this.llaveRef, actorId],
    );
  }

  async crear(
    ctx: ContextoTenant,
    copropiedadId: string,
    alta: AltaDeEquipo,
    veredicto: ResultadoDeSondeo,
  ): Promise<DatosDeEquipo> {
    const actorId = ctx.usuarioId;
    return this.conCliente(ctx, async (c) => {
      await c.query('BEGIN');
      try {
        const { rows } = await c.query<FilaDeEquipo>(
          `INSERT INTO public.dispositivos
             (copropiedad_id, nombre, tipo, host, puerto, protocolo, usuario,
              credencial_ref, modelo, firmware, canal_barrera, numero_de_puerta,
              canal_de_audio, verificacion, verificado_en, motivo_no_verificado,
              creado_por, actualizado_por)
           VALUES ($1, $2, $3::tipo_dispositivo, $4, $5, $6::protocolo_equipo, $7,
                   'vault:pendiente', $8, $9, $10, $11, $12,
                   $13::verificacion_equipo, $14, $15, $16, $16)
           RETURNING ${CAMPOS}`,
          [
            copropiedadId,
            alta.nombre,
            alta.tipo,
            alta.host,
            alta.puerto,
            alta.protocolo,
            alta.usuario,
            veredicto.modelo ?? alta.modelo ?? null,
            veredicto.firmware,
            alta.canalBarrera ?? null,
            alta.numeroDePuerta ?? null,
            alta.canalDeAudio ?? null,
            verificacionDe(veredicto),
            veredicto.verificado ? new Date() : null,
            veredicto.verificado ? null : veredicto.detalle,
            actorId,
          ],
        );
        const fila = rows[0];
        if (fila === undefined) throw new Error('El alta del equipo no devolvió fila');

        // La referencia apunta a la bóveda del propio equipo. Se escribe DESPUÉS
        // de conocer el id y ANTES del COMMIT: no existe un instante en que la
        // fila esté visible con una referencia que no apunta a nada.
        await c.query(
          `UPDATE public.dispositivos SET credencial_ref = $2, actualizado_por = $3 WHERE id = $1`,
          [fila.id, `vault:equipos/${fila.id}`, actorId],
        );
        if (alta.secreto !== undefined) {
          await this.guardarSecreto(c, copropiedadId, actorId, fila.id, alta.secreto);
        }
        await this.auditar(c, copropiedadId, actorId, 'equipos/alta', fila.nombre);
        await c.query('COMMIT');
        return aDatos(fila);
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      }
    });
  }

  async editar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    alta: AltaDeEquipo,
    veredicto: ResultadoDeSondeo,
  ): Promise<DatosDeEquipo | null> {
    const actorId = ctx.usuarioId;
    return this.conCliente(ctx, async (c) => {
      await c.query('BEGIN');
      try {
        const { rows } = await c.query<FilaDeEquipo>(
          `UPDATE public.dispositivos
              SET nombre = $3, tipo = $4::tipo_dispositivo, host = $5, puerto = $6,
                  protocolo = $7::protocolo_equipo, usuario = $8,
                  modelo = COALESCE($9, modelo), firmware = COALESCE($10, firmware),
                  canal_barrera = $11, numero_de_puerta = $12, canal_de_audio = $13,
                  verificacion = $14::verificacion_equipo, verificado_en = $15,
                  motivo_no_verificado = $16, actualizado_por = $17
            WHERE id = $2 AND copropiedad_id = $1
        RETURNING ${CAMPOS}`,
          [
            copropiedadId,
            equipoId,
            alta.nombre,
            alta.tipo,
            alta.host,
            alta.puerto,
            alta.protocolo,
            alta.usuario,
            veredicto.modelo ?? alta.modelo ?? null,
            veredicto.firmware,
            alta.canalBarrera ?? null,
            alta.numeroDePuerta ?? null,
            alta.canalDeAudio ?? null,
            verificacionDe(veredicto),
            veredicto.verificado ? new Date() : null,
            veredicto.verificado ? null : veredicto.detalle,
            actorId,
          ],
        );
        const fila = rows[0];
        if (fila === undefined) {
          await c.query('ROLLBACK');
          return null;
        }
        // `undefined` = «no lo cambies». Es la única lectura posible: una
        // pantalla que no muestra el secreto tampoco puede reenviarlo.
        if (alta.secreto !== undefined) {
          await this.guardarSecreto(c, copropiedadId, actorId, equipoId, alta.secreto);
        }
        await this.auditar(c, copropiedadId, actorId, 'equipos/edicion', fila.nombre);
        await c.query('COMMIT');
        return aDatos(fila);
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      }
    });
  }

  async desactivar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    motivo: string,
  ): Promise<DatosDeEquipo | null> {
    return this.cambiarEstado(ctx, copropiedadId, equipoId, 'inactivo', motivo);
  }

  async reactivar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<DatosDeEquipo | null> {
    return this.cambiarEstado(ctx, copropiedadId, equipoId, 'activo', null);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * LA CREDENCIAL, DESCIFRADA Y **SÓLO PARA HABLAR CON EL EQUIPO** · 15-C
   *
   * Es la única lectura del sobre en todo el proyecto, y existe porque
   * corregir la configuración de un equipo exige presentarle su clave. Lo que
   * se mantiene, y es lo que importa:
   *
   * · **no sale por ninguna ruta HTTP** — el DTO de lectura ni declara el
   *   campo (A.2), y este método no lo alcanza ningún controlador de consulta;
   * · **no se registra** en bitácora ni en auditoría: lo que se audita es que
   *   hubo una corrección, quién la hizo y de qué valor a cuál;
   * · vive en memoria el tiempo de una petición y se pasa directamente al
   *   adaptador.
   *
   * Que exista es el precio de `H-15B-1`, que ya está declarado con su riesgo
   * residual. Que sea el ÚNICO sitio es lo que lo mantiene auditable.
   */
  async credencialPara(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<string | null> {
    return this.conCliente(ctx, async (c) => {
      const { rows } = await c.query<{
        iv: Buffer;
        cuerpo: Buffer;
        etiqueta: Buffer;
      }>(
        `SELECT iv, cuerpo, etiqueta FROM public.credenciales_de_equipo
          WHERE dispositivo_id = $1 AND copropiedad_id = $2 AND activa = true`,
        [equipoId, copropiedadId],
      );
      const fila = rows[0];
      if (fila === undefined) return null;
      const llave = derivarLlave(this.llaveMaestra, copropiedadId, PROPOSITOS.credencialesDeEquipo);
      return descifrar(llave, {
        iv: fila.iv,
        cuerpo: fila.cuerpo,
        etiqueta: fila.etiqueta,
      }).toString('utf8');
    });
  }

  /**
   * Deja constancia de una corrección aplicada en el equipo.
   *
   * Va aparte de la corrección misma porque la corrección la ejecuta el
   * adaptador y la constancia la escribe la base: lo que se registra es **qué
   * cambió y de qué valor a cuál**, que es lo que una auditoría necesita para
   * reconstruir quién dejó el equipo como está.
   */
  async auditarCorreccion(
    ctx: ContextoTenant,
    copropiedadId: string,
    detalle: string,
  ): Promise<void> {
    await this.conCliente(ctx, async (c) => {
      await this.auditar(c, copropiedadId, ctx.usuarioId, 'equipos/correccion', detalle);
    });
  }

  private async cambiarEstado(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    estado: 'activo' | 'inactivo',
    motivo: string | null,
  ): Promise<DatosDeEquipo | null> {
    const actorId = ctx.usuarioId;
    return this.conCliente(ctx, async (c) => {
      await c.query('BEGIN');
      try {
        const { rows } = await c.query<FilaDeEquipo>(
          `UPDATE public.dispositivos
              SET estado = $3::estado_registro,
                  desactivado_en = CASE WHEN $3 = 'inactivo' THEN now() ELSE NULL END,
                  desactivado_por = CASE WHEN $3 = 'inactivo' THEN $4::uuid ELSE NULL END,
                  motivo_desactivacion = $5,
                  actualizado_por = $4
            WHERE id = $2 AND copropiedad_id = $1
        RETURNING ${CAMPOS}`,
          [copropiedadId, equipoId, estado, actorId, motivo],
        );
        const fila = rows[0];
        if (fila === undefined) {
          await c.query('ROLLBACK');
          return null;
        }
        await this.auditar(
          c,
          copropiedadId,
          actorId,
          estado === 'inactivo' ? 'equipos/baja' : 'equipos/reactivacion',
          fila.nombre,
        );
        await c.query('COMMIT');
        return aDatos(fila);
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      }
    });
  }
}
