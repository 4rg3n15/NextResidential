import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { AmbitoDelResidente, MotivoDeNoAutorizar } from '@ncr/domain-core';
import { BaseDelResidentePg } from './base-pg';
import type {
  AutorizacionesDelResidente,
  HechosDeLaBase,
  NuevaAutorizacion,
} from '../aplicacion/puertos';

/**
 * Escritura de la autorización del residente (M-4), y los hechos que la
 * gobiernan.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA DE ESTE FICHERO ES LA DEL DIRECTORIO
 *
 * `copropiedad_id` y `vivienda_id` salen SIEMPRE del ámbito, nunca de la
 * petición. En la escritura importa más que en la lectura: una lectura mal
 * filtrada enseña datos del vecino; una escritura mal filtrada **crea
 * autorizaciones en la casa del vecino**, y eso abre una puerta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CÓDIGO 23505 NO ES UN ERROR TÉCNICO
 *
 * Los dos índices únicos que esta escritura puede tocar dicen cosas distintas y
 * se distinguen POR NOMBRE, no por el texto del mensaje:
 *
 *   · `autorizaciones_idempotencia_uk` → el residente reintentó. No es un
 *     fallo: se devuelve la autorización que ya existía.
 *   · `vehiculos_placa_activa_uk` → RN-04 / CA-03.
 *
 * Mirar `e.constraint` y no el texto es deliberado: el texto de PostgreSQL
 * cambia con la versión y con el idioma del servidor, y una comprobación por
 * texto es la familia de defecto que este repositorio persigue (D-79).
 */
@Injectable()
export class AutorizacionesDelResidentePg
  extends BaseDelResidentePg
  implements AutorizacionesDelResidente
{
  /**
   * Los cuatro hechos, en una sola ida.
   *
   * La lista negra se cruza por DOCUMENTO y por PLACA (RN-06 admite los dos
   * objetivos, y la tabla también). Si el residente no da documento, la persona
   * no se puede cruzar —no hay con qué— y el veto por placa sigue aplicando:
   * es la mitad que sí se puede comprobar, y comprobar media regla es mejor que
   * no comprobar ninguna. Queda `[SUPUESTO]` S-22 en el informe.
   */
  async hechosParaAutorizar(
    ambito: AmbitoDelResidente,
    consulta: { readonly documento: string | null; readonly placa: string | null },
  ): Promise<HechosDeLaBase> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        vetado: boolean;
        vivienda_activa: boolean;
        placa_activa: boolean;
      }>(
        `SELECT
           EXISTS (
             SELECT 1 FROM public.listas_negras ln
              WHERE ln.copropiedad_id = $1
                AND ln.estado = 'activa'
                AND (
                  ($3::text IS NOT NULL AND ln.persona_id IN (
                     SELECT p.id FROM public.personas p
                      WHERE p.copropiedad_id = $1
                        AND p.numero_documento = app.normalizar_documento($3)))
                  OR ($4::text IS NOT NULL AND ln.placa = app.normalizar_placa($4))
                )
           ) AS vetado,
           COALESCE((SELECT v.estado = 'activo' FROM public.viviendas v
                      WHERE v.copropiedad_id = $1 AND v.id = $2), false) AS vivienda_activa,
           EXISTS (
             SELECT 1 FROM public.vehiculos ve
              WHERE ve.copropiedad_id = $1
                AND ve.estado = 'activo'
                AND $4::text IS NOT NULL
                AND ve.placa = app.normalizar_placa($4)
                AND ve.vivienda_id <> $2
           ) AS placa_activa`,
        [ambito.copropiedadId, ambito.viviendaId, consulta.documento, consulta.placa],
      );
      const f = rows[0];
      return {
        visitanteVetado: f?.vetado ?? false,
        viviendaActiva: f?.vivienda_activa ?? false,
        placaYaActiva: f?.placa_activa ?? false,
      };
    });
  }

  async crearAutorizacion(
    ambito: AmbitoDelResidente,
    creadaPor: { readonly usuarioId: string; readonly residenteId: string },
    nueva: NuevaAutorizacion,
  ): Promise<
    | { readonly ok: true; readonly id: string; readonly repetida: boolean }
    | { readonly ok: false; readonly motivo: MotivoDeNoAutorizar }
  > {
    // El reintento se resuelve ANTES de abrir la transacción: es el camino más
    // frecuente del modo sin conexión y no tiene por qué pagar un BEGIN.
    const yaEstaba = await this.porClave(ambito, nueva.claveDeIdempotencia);
    if (yaEstaba !== null) return { ok: true, id: yaEstaba, repetida: true };

    try {
      const id = await this.enTransaccion(async (c) => {
        const visitanteId = await this.visitante(c, ambito, nueva);
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO public.autorizaciones
             (copropiedad_id, vivienda_id, visitante_id, autorizado_por, tipo, placa,
              vigencia, permite_acceso_vehicular, observaciones, clave_idempotencia,
              creado_por, actualizado_por)
           VALUES ($1, $2, $3, $4, $5, app.normalizar_placa($6),
                   tstzrange($7::timestamptz, $8::timestamptz, '[)'), $9, $10, $11, $12, $12)
           RETURNING id`,
          [
            ambito.copropiedadId,
            ambito.viviendaId,
            visitanteId,
            creadaPor.residenteId,
            nueva.patron === null ? 'unica' : 'recurrente',
            nueva.placa,
            nueva.desde,
            nueva.hasta,
            nueva.permiteAccesoVehicular,
            nueva.observaciones,
            nueva.claveDeIdempotencia,
            creadaPor.usuarioId,
          ],
        );
        const autorizacionId = rows[0]?.id;
        if (autorizacionId === undefined) throw new Error('el INSERT no devolvió identificador');

        await this.acompanantes(c, ambito, autorizacionId, creadaPor.usuarioId, nueva.acompanantes);
        await this.zonas(c, ambito, autorizacionId, creadaPor.usuarioId, nueva.zonasPermitidas);
        return autorizacionId;
      });
      return { ok: true, id, repetida: false };
    } catch (e) {
      const restriccion = (e as { constraint?: string }).constraint ?? '';
      if (restriccion === 'autorizaciones_idempotencia_uk') {
        // Carrera real: dos reintentos a la vez. El que perdió lee el del otro.
        const gemela = await this.porClave(ambito, nueva.claveDeIdempotencia);
        if (gemela !== null) return { ok: true, id: gemela, repetida: true };
      }
      if (restriccion.includes('placa')) return { ok: false, motivo: 'PLACA_DUPLICADA' };
      throw e;
    }
  }

  private async porClave(ambito: AmbitoDelResidente, clave: string): Promise<string | null> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM public.autorizaciones
          WHERE copropiedad_id = $1 AND vivienda_id = $2 AND clave_idempotencia = $3`,
        [ambito.copropiedadId, ambito.viviendaId, clave],
      );
      return rows[0]?.id ?? null;
    });
  }

  /**
   * Busca o crea al visitante. Por documento cuando lo hay, y **solo** por
   * documento: unir por nombre juntaría a dos «Juan Pérez» distintos en una
   * sola persona, y con ellos su historial de accesos y su lista negra.
   */
  private async visitante(
    c: PoolClient,
    ambito: AmbitoDelResidente,
    nueva: NuevaAutorizacion,
  ): Promise<string> {
    const personaId = await this.persona(c, ambito, nueva.visitante, nueva.documento);
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO public.visitantes (copropiedad_id, persona_id, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (copropiedad_id, persona_id) WHERE estado = 'activo'
         DO UPDATE SET actualizado_en = now()
       RETURNING id`,
      [ambito.copropiedadId, personaId, this.claims['usuario_id'] ?? null],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('no se pudo registrar al visitante');
    return id;
  }

  private async persona(
    c: PoolClient,
    ambito: AmbitoDelResidente,
    nombre: string,
    documento: string | null,
  ): Promise<string> {
    if (documento !== null) {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM public.personas
          WHERE copropiedad_id = $1
            AND numero_documento = app.normalizar_documento($2)
            AND estado = 'activo'`,
        [ambito.copropiedadId, documento],
      );
      const existente = rows[0]?.id;
      if (existente !== undefined) return existente;
    }
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO public.personas
         (copropiedad_id, nombre_completo, numero_documento, creado_por, actualizado_por)
       VALUES ($1, $2, CASE WHEN $3::text IS NULL THEN NULL ELSE app.normalizar_documento($3) END,
               $4, $4)
       RETURNING id`,
      [ambito.copropiedadId, nombre, documento, this.claims['usuario_id'] ?? null],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('no se pudo registrar a la persona');
    return id;
  }

  /** HU-08 · nominales: cada acompañante es una persona, no un contador. */
  private async acompanantes(
    c: PoolClient,
    ambito: AmbitoDelResidente,
    autorizacionId: string,
    usuarioId: string,
    nombres: readonly string[],
  ): Promise<void> {
    for (const nombre of nombres) {
      const personaId = await this.persona(c, ambito, nombre, null);
      await c.query(
        `INSERT INTO public.autorizacion_acompanantes
           (copropiedad_id, autorizacion_id, persona_id, creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $4)`,
        [ambito.copropiedadId, autorizacionId, personaId, usuarioId],
      );
    }
  }

  /**
   * Zonas permitidas. El `SELECT` de comprobación no es redundante con la clave
   * ajena: acota las zonas a las de ESTA copropiedad antes de insertarlas, de
   * modo que un identificador de zona de otro conjunto no llega ni a intentarse.
   */
  private async zonas(
    c: PoolClient,
    ambito: AmbitoDelResidente,
    autorizacionId: string,
    usuarioId: string,
    zonas: readonly string[],
  ): Promise<void> {
    if (zonas.length === 0) return;
    await c.query(
      `INSERT INTO public.autorizaciones_zona
         (copropiedad_id, autorizacion_id, zona_id, creado_por, actualizado_por)
       SELECT $1, $2, z.id, $4, $4
         FROM public.zonas z
        WHERE z.copropiedad_id = $1 AND z.id = ANY($3::uuid[])`,
      [ambito.copropiedadId, autorizacionId, [...zonas], usuarioId],
    );
  }
}
