import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { AmbitoDelResidente } from '@ncr/domain-core';
import type {
  AutorizacionDelResidente,
  DirectorioDelResidente,
  EventoDelResidente,
  FiltroDeHistorial,
  MiembroDeFamilia,
  VehiculoDelResidente,
  VinculoDeResidente,
  ViviendaDelResidente,
} from '../aplicacion/puertos';

/**
 * Adaptador PostgreSQL del directorio del residente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA DE ESTE FICHERO, Y NO HAY OTRA
 *
 * **Toda** consulta lleva `copropiedad_id = $1 AND vivienda_id = $2`, y los dos
 * valores salen del `AmbitoDelResidente`, que nació de la identidad. No hay una
 * sola sentencia aquí que acepte una vivienda venida de la petición.
 *
 * Y la barrera es de APLICACIÓN a propósito, no de RLS: la API se conecta con
 * la llave secreta, que omite la RLS por completo (§2.7.6). Si estas consultas
 * se limitaran a `copropiedad_id` confiando en que la base filtre la vivienda,
 * un residente leería el padrón entero de su conjunto — con la RLS activa y
 * «correcta». Es el mismo razonamiento que sostiene el primer eje, aplicado al
 * segundo.
 *
 * `set_config('request.jwt.claims', …)` se fija igual que en el resto de
 * adaptadores para que la RLS siga siendo la segunda barrera cuando la conexión
 * sí esté sujeta a ella.
 */
@Injectable()
export class DirectorioDelResidentePg implements DirectorioDelResidente {
  constructor(
    private readonly pool: Pool,
    private readonly claims: Record<string, unknown> = {},
  ) {}

  private async conContexto<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  /**
   * Identidad → vivienda. El único método que no recibe ámbito, porque es el
   * que lo hace posible.
   *
   * `u.id = $1` y no `auth_user_id`: el claim `usuario_id` que emite el hook de
   * la 0024 es la fila de `usuarios`. Se exige `r.estado = 'activo'`: un
   * residente desactivado conserva su historial (RN-19) y **no** conserva el
   * acceso.
   *
   * `ORDER BY r.es_titular DESC, r.creado_en` y `LIMIT 1` porque el modelo
   * admite varios vínculos por persona y la app del residente muestra una
   * vivienda. Queda anotado como `[SUPUESTO]` S-21: si Grupo Control quiere
   * multivivienda para un mismo residente, es una HU propia y un selector en la
   * app, no un cambio en esta consulta.
   */
  async vinculoDe(usuarioId: string): Promise<VinculoDeResidente | null> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        copropiedad_id: string;
        vivienda_id: string;
        residente_id: string;
        persona_id: string;
        es_titular: boolean;
        nivel: string | null;
      }>(
        `SELECT r.copropiedad_id,
                r.vivienda_id,
                r.id          AS residente_id,
                r.persona_id,
                r.es_titular,
                n.clave       AS nivel
           FROM public.usuarios   u
           JOIN public.residentes r ON r.persona_id = u.persona_id
                                   AND r.estado = 'activo'
           JOIN public.viviendas  v ON v.id = r.vivienda_id
                                   AND v.copropiedad_id = r.copropiedad_id
      LEFT JOIN public.niveles_de_acceso n ON n.id = r.nivel_acceso_id
          WHERE u.id = $1
            AND u.estado = 'activo'
          ORDER BY r.es_titular DESC, r.creado_en ASC
          LIMIT 1`,
        [usuarioId],
      );
      const f = rows[0];
      if (f === undefined) return null;
      return {
        copropiedadId: f.copropiedad_id,
        viviendaId: f.vivienda_id,
        residenteId: f.residente_id,
        personaId: f.persona_id,
        esTitular: f.es_titular,
        nivelAcceso: f.nivel,
      };
    });
  }

  async vivienda(ambito: AmbitoDelResidente): Promise<ViviendaDelResidente | null> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        identificador: string;
        agrupacion: string | null;
        direccion: string | null;
        estado: string;
        estado_administrativo: string;
        etiqueta_vivienda: string;
        etiqueta_agrupacion: string;
        copropiedad: string;
      }>(
        `SELECT v.id, v.identificador, v.agrupacion,
                coalesce(v.direccion, cp.direccion) AS direccion,
                v.estado, v.estado_administrativo,
                cp.etiqueta_vivienda, cp.etiqueta_agrupacion,
                cp.nombre AS copropiedad
           FROM public.viviendas v
           JOIN public.copropiedades cp ON cp.id = v.copropiedad_id
          WHERE v.copropiedad_id = $1 AND v.id = $2`,
        [ambito.copropiedadId, ambito.viviendaId],
      );
      const f = rows[0];
      if (f === undefined) return null;
      return {
        id: f.id,
        identificador: f.identificador,
        agrupacion: f.agrupacion,
        etiquetaVivienda: f.etiqueta_vivienda,
        etiquetaAgrupacion: f.etiqueta_agrupacion,
        direccion: f.direccion,
        copropiedadNombre: f.copropiedad,
        estadoAdministrativo: f.estado_administrativo,
        activa: f.estado === 'activo',
      };
    });
  }

  async familia(ambito: AmbitoDelResidente): Promise<readonly MiembroDeFamilia[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        nombre: string;
        parentesco: string | null;
        es_titular: boolean;
        nivel: string | null;
        estado: string;
      }>(
        `SELECT r.id, p.nombre_completo AS nombre, r.parentesco, r.es_titular,
                n.clave AS nivel, r.estado
           FROM public.residentes r
           JOIN public.personas   p ON p.id = r.persona_id
      LEFT JOIN public.niveles_de_acceso n ON n.id = r.nivel_acceso_id
          WHERE r.copropiedad_id = $1 AND r.vivienda_id = $2
          ORDER BY r.es_titular DESC, p.nombre_completo ASC`,
        [ambito.copropiedadId, ambito.viviendaId],
      );
      return rows.map((f) => ({
        residenteId: f.id,
        nombre: f.nombre,
        parentesco: f.parentesco,
        esTitular: f.es_titular,
        nivelAcceso: f.nivel,
        activo: f.estado === 'activo',
      }));
    });
  }

  async vehiculos(ambito: AmbitoDelResidente): Promise<readonly VehiculoDelResidente[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        placa: string;
        marca: string | null;
        modelo: string | null;
        color: string | null;
        es_principal: boolean;
        estado: string;
      }>(
        `SELECT id, placa, marca, modelo, color, es_principal, estado
           FROM public.vehiculos
          WHERE copropiedad_id = $1 AND vivienda_id = $2
          ORDER BY es_principal DESC, placa ASC`,
        [ambito.copropiedadId, ambito.viviendaId],
      );
      return rows.map((f) => ({
        id: f.id,
        placa: f.placa,
        marca: f.marca,
        modelo: f.modelo,
        color: f.color,
        esPrincipal: f.es_principal,
        activo: f.estado === 'activo',
      }));
    });
  }

  async autorizaciones(ambito: AmbitoDelResidente): Promise<readonly AutorizacionDelResidente[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        visitante: string;
        tipo: string;
        desde: Date;
        hasta: Date;
        placa: string | null;
        vehicular: boolean;
        estado: string;
        acompanantes: string;
      }>(
        `SELECT a.id,
                p.nombre_completo AS visitante,
                a.tipo,
                lower(a.vigencia) AS desde,
                upper(a.vigencia) AS hasta,
                a.placa,
                a.permite_acceso_vehicular AS vehicular,
                a.estado,
                (SELECT count(*) FROM public.autorizacion_acompanantes ac
                  WHERE ac.autorizacion_id = a.id) AS acompanantes
           FROM public.autorizaciones a
           JOIN public.personas p ON p.id = a.visitante_id
          WHERE a.copropiedad_id = $1 AND a.vivienda_id = $2
          ORDER BY lower(a.vigencia) DESC
          LIMIT 200`,
        [ambito.copropiedadId, ambito.viviendaId],
      );
      return rows.map((f) => ({
        id: f.id,
        visitante: f.visitante,
        tipo: f.tipo,
        desde: f.desde.toISOString(),
        hasta: f.hasta.toISOString(),
        placa: f.placa,
        permiteAccesoVehicular: f.vehicular,
        estado: f.estado,
        acompanantes: Number(f.acompanantes),
      }));
    });
  }

  /**
   * El historial de la vivienda. `vivienda_id` en `eventos` es nullable —un
   * evento de zona común puede no tener vivienda destino—, y aquí se exige
   * igual: un evento sin vivienda no es «de todas», es de ninguna (la misma
   * regla que `alcanzaVivienda` aplica en el dominio).
   *
   * El periodo se traduce a un intervalo y NO se interpola: `$3` es el número
   * de días y la comparación usa `now() - ($3 || ' days')::interval`. Un
   * intervalo armado por concatenación sería la primera inyección del proyecto.
   */
  async historial(
    ambito: AmbitoDelResidente,
    filtro: FiltroDeHistorial,
  ): Promise<readonly EventoDelResidente[]> {
    const dias = { hoy: 1, semana: 7, mes: 30, todo: 3650 }[filtro.periodo];
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        ocurrido_en: Date;
        tipo: string;
        resultado: string | null;
        motivo: string | null;
        metodo: string;
        placa_detectada: string | null;
        persona: string | null;
        zona: string | null;
        decidido_por_edge: boolean;
      }>(
        `SELECT e.id, e.ocurrido_en, e.tipo, e.resultado, e.motivo, e.metodo,
                e.placa_detectada, p.nombre_completo AS persona, z.nombre AS zona,
                e.decidido_por_edge
           FROM public.eventos e
      LEFT JOIN public.personas p ON p.id = e.persona_id
      LEFT JOIN public.zonas    z ON z.id = e.zona_id
          WHERE e.copropiedad_id = $1
            AND e.vivienda_id = $2
            AND e.ocurrido_en >= now() - ($3 || ' days')::interval
          ORDER BY e.ocurrido_en DESC
          LIMIT $4`,
        [ambito.copropiedadId, ambito.viviendaId, dias, filtro.limite],
      );
      return rows.map((f) => ({
        id: f.id,
        ocurridoEn: f.ocurrido_en.toISOString(),
        tipo: f.tipo,
        resultado: f.resultado,
        motivo: f.motivo,
        metodo: f.metodo,
        placaDetectada: f.placa_detectada,
        persona: f.persona,
        zona: f.zona,
        decididoPorEdge: f.decidido_por_edge,
      }));
    });
  }
}
