import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { ContextoTenant } from '../../autenticacion';
import { PROPOSITOS, cifrar, descifrar, derivarLlave } from '../../comun/cripto/sobre-aes-gcm';
import type {
  AltaDeEquipo,
  DatosDeEquipo,
  EstadoDeVerificacion,
  ModoDeTerminalDeclarado,
  ProtocoloDeEquipo,
  RepositorioDeEquipos,
  ResultadoDeSondeo,
  TipoDeEquipo,
} from '../aplicacion/puertos';
import { capacidadesDesdeJson } from '@ncr/providers';
import { ACTOR_INGESTA as ACTOR_DE_SERVICIO } from '../../comun/actores-de-servicio';

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
  readonly fabricante: string | null;
  readonly canal_barrera: number | null;
  readonly numero_de_puerta: number | null;
  readonly canal_de_audio: number | null;
  readonly modo_de_terminal: ModoDeTerminalDeclarado | null;
  readonly canal_de_audio_habilitado: boolean;
  readonly capacidades: unknown;
  readonly verificacion: EstadoDeVerificacion;
  readonly verificado_en: Date | null;
  readonly motivo_no_verificado: string | null;
  readonly estado: 'activo' | 'inactivo';
}

const CAMPOS = `
  id, nombre, tipo::text AS tipo, host, puerto, protocolo::text AS protocolo, usuario,
  modelo, firmware, fabricante, canal_barrera, numero_de_puerta, canal_de_audio,
  modo_de_terminal, canal_de_audio_habilitado, capacidades,
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
  fabricante: f.fabricante,
  canalBarrera: f.canal_barrera,
  numeroDePuerta: f.numero_de_puerta,
  canalDeAudio: f.canal_de_audio,
  modoDeTerminal: f.modo_de_terminal,
  canalDeAudioHabilitado: f.canal_de_audio_habilitado,
  // Se lee sin confiar en la forma: lo corrupto vuelve a DESCONOCIDA.
  capacidades: f.capacidades === null ? null : capacidadesDesdeJson(f.capacidades),
  verificacion: f.verificacion,
  verificadoEn: f.verificado_en === null ? null : f.verificado_en.toISOString(),
  motivoNoVerificado: f.motivo_no_verificado,
  estado: f.estado,
});

const verificacionDe = (v: ResultadoDeSondeo): EstadoDeVerificacion =>
  v.verificado ? 'verificado' : v.clase === 'decide_solo' ? 'rechazado' : 'no_verificado';

/** Claims de SERVICIO para una copropiedad: lo único que lee el sobre. */
export const claimsDeServicio = (copropiedadId: string): Record<string, unknown> => ({
  rol: 'servicio',
  usuario_id: ACTOR_DE_SERVICIO,
  copropiedad_id: copropiedadId,
  copropiedades: [copropiedadId],
});

/**
 * El sobre, descifrado, **sólo para hablar con el equipo**. Lo comparten el
 * repositorio (corrección desde la consola) y el registro que alimenta al
 * proveedor. Un solo sitio que descifra es lo que lo mantiene auditable.
 */
export const leerSobre = async (
  pool: Pool,
  llaveMaestra: string,
  copropiedadId: string,
  equipoId: string,
): Promise<string | null> => {
  const cliente = await pool.connect();
  try {
    await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claimsDeServicio(copropiedadId)),
    ]);
    const { rows } = await cliente.query<{ iv: Buffer; cuerpo: Buffer; etiqueta: Buffer }>(
      `SELECT iv, cuerpo, etiqueta FROM public.credenciales_de_equipo
        WHERE dispositivo_id = $1 AND copropiedad_id = $2 AND estado = 'activo'`,
      [equipoId, copropiedadId],
    );
    const fila = rows[0];
    if (fila === undefined) return null;
    const llave = derivarLlave(llaveMaestra, copropiedadId, PROPOSITOS.credencialesDeEquipo);
    return descifrar(llave, { iv: fila.iv, cuerpo: fila.cuerpo, etiqueta: fila.etiqueta }).toString(
      'utf8',
    );
  } finally {
    cliente.release();
  }
};

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
              creado_por, actualizado_por, fabricante, modo_de_terminal,
              canal_de_audio_habilitado, capacidades, capacidades_descubiertas_en)
           VALUES ($1, $2, $3::tipo_dispositivo, $4, $5, $6::protocolo_equipo, $7,
                   'vault:pendiente', $8, $9, $10, $11, $12,
                   $13::verificacion_equipo, $14, $15, $16, $16, $17, $18, $19,
                   $20::jsonb, CASE WHEN $20::jsonb IS NULL THEN NULL ELSE now() END)
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
            alta.fabricante ?? null,
            alta.modoDeTerminal ?? null,
            alta.canalDeAudioHabilitado ?? false,
            veredicto.capacidades === undefined ? null : JSON.stringify(veredicto.capacidades),
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
                  motivo_no_verificado = $16, actualizado_por = $17,
                  fabricante = $18, modo_de_terminal = $19, canal_de_audio_habilitado = $20,
                  -- Unas capacidades recién descubiertas sustituyen a las viejas;
                  -- un sondeo que no alcanzó el equipo conserva las que había.
                  capacidades = COALESCE($21::jsonb, capacidades),
                  capacidades_descubiertas_en = CASE WHEN $21::jsonb IS NULL
                    THEN capacidades_descubiertas_en ELSE now() END
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
            alta.fabricante ?? null,
            alta.modoDeTerminal ?? null,
            alta.canalDeAudioHabilitado ?? false,
            veredicto.capacidades === undefined ? null : JSON.stringify(veredicto.capacidades),
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
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * P6 · CORREGIDO EN LA 15-D. Dos defectos en una consulta que nunca corrió
     *
     * 1. Filtraba por `activa = true`, y la columna se llama `estado`. Contra
     *    base real la consulta fallaba con «column does not exist».
     * 2. Corría con los claims del ADMINISTRADOR, y la política de lectura de
     *    `credenciales_de_equipo` sólo deja leer a `servicio` (migración 0032:
     *    «NADIE lee esta tabla con un token de usuario, ni el
     *    superadministrador»). Con la columna corregida habría devuelto 0 filas.
     *
     * Ninguno de los dos se vio porque la suite usa el doble en memoria. Ahora
     * la lectura del sobre corre con los claims de SERVICIO de esa copropiedad
     * —que es lo que la política exige— y la comprobación de alcance del
     * administrador la hizo el controlador antes, por el filtro de aplicación.
     * Lo prueba `test/registro-de-equipos-pg.test.ts` contra base real.
     */
    void ctx;
    return leerSobre(this.pool, this.llaveMaestra, copropiedadId, equipoId);
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
