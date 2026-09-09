import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { UMBRAL_DE_LATIDO_POR_DEFECTO } from '@ncr/domain-core';
import type { VentanaDelDia } from '@ncr/domain-core';
import type {
  ConfiguracionDeTablero,
  ConteosDeAlertas,
  ConteosDelPadron,
  ConteosDeVisitantes,
  DispositivoDelTablero,
  FranjaDeAccesos,
  RepositorioTablero,
  SeveridadDeAlerta,
} from '../aplicacion/puertos';

/**
 * Adaptador PostgreSQL del tablero.
 *
 * **Todo va parametrizado** (§2.7.4): ni un identificador ni una fecha se
 * concatena. La zona horaria entra como parámetro de `AT TIME ZONE`, que
 * PostgreSQL acepta como texto, así que tampoco ahí hay interpolación.
 *
 * **`credencial_ref` no aparece en ninguna de estas consultas.** No es un
 * descuido afortunado: es la única forma de garantizar que no salga. Un
 * `SELECT *` con un mapeo que «se olvide» del campo lo trae hasta el proceso y
 * lo deja a un `JSON.stringify` de distancia del navegador (RN-21).
 *
 * **Sin N+1** (§2.4): cada método es una consulta. Los conteos del padrón salen
 * en una sola pasada con agregados condicionales en vez de cuatro `SELECT
 * count(*)`, que serían cuatro viajes para pintar una fila de tarjetas.
 */
@Injectable()
export class RepositorioTableroPg implements RepositorioTablero {
  constructor(private readonly pool: Pool) {}

  async configuracion(copropiedadId: string): Promise<ConfiguracionDeTablero | null> {
    const { rows } = await this.pool.query<{
      zona_horaria: string;
      periodo_latido_segundos: string;
      latidos_tolerados: number;
      umbral_latido_segundos: string;
    }>(
      `SELECT zona_horaria,
              extract(epoch FROM periodo_latido)              AS periodo_latido_segundos,
              latidos_tolerados,
              extract(epoch FROM umbral_latido_dispositivo)   AS umbral_latido_segundos
         FROM public.copropiedades
        WHERE id = $1 AND estado = 'activa'`,
      [copropiedadId],
    );
    const fila = rows[0];
    if (fila === undefined) return null;
    return {
      copropiedadId,
      zonaHoraria: fila.zona_horaria,
      umbralDeLatido: {
        periodoSegundos: Number(fila.periodo_latido_segundos),
        latidosTolerados: fila.latidos_tolerados,
        silencioParaCaidoSegundos: Number(fila.umbral_latido_segundos),
      },
    };
  }

  async conteosDelPadron(copropiedadId: string, ventana: VentanaDelDia): Promise<ConteosDelPadron> {
    const { rows } = await this.pool.query<{
      residentes_activos: string;
      residentes_alta: string;
      vehiculos_activos: string;
      vehiculos_alta: string;
    }>(
      `SELECT
         (SELECT count(*) FROM public.residentes
           WHERE copropiedad_id = $1 AND estado = 'activo')                     AS residentes_activos,
         (SELECT count(*) FROM public.residentes
           WHERE copropiedad_id = $1 AND estado = 'activo'
             AND creado_en >= $2 AND creado_en < $3)                            AS residentes_alta,
         (SELECT count(*) FROM public.vehiculos
           WHERE copropiedad_id = $1 AND activo)                                AS vehiculos_activos,
         (SELECT count(*) FROM public.vehiculos
           WHERE copropiedad_id = $1 AND activo
             AND creado_en >= $2 AND creado_en < $3)                            AS vehiculos_alta`,
      [copropiedadId, ventana.desde, ventana.hasta],
    );
    const f = rows[0];
    return {
      residentesActivos: Number(f?.residentes_activos ?? 0),
      residentesAltaEnVentana: Number(f?.residentes_alta ?? 0),
      vehiculosActivos: Number(f?.vehiculos_activos ?? 0),
      vehiculosAltaEnVentana: Number(f?.vehiculos_alta ?? 0),
    };
  }

  /**
   * «Visitantes hoy» son las autorizaciones **activas cuya vigencia se cruza con
   * el día local**, no las creadas hoy: una autorización emitida anoche para la
   * visita de esta mañana es un visitante de hoy, y el mockup cuenta visitas, no
   * altas. El cruce lo resuelve `&&` sobre el `tstzrange`, que usa el índice GiST
   * de la migración 0007 en vez de recorrer la tabla.
   *
   * «Dentro ahora» se deriva del histórico: ingresos del día menos salidas, por
   * persona. Es una aproximación declarada y no un conteo autoritativo — la
   * salida puede no registrarse por fallo de sensor (CU-05, excepción 6a), y por
   * eso nunca baja de cero.
   */
  async conteosDeVisitantes(
    copropiedadId: string,
    ventana: VentanaDelDia,
  ): Promise<ConteosDeVisitantes> {
    const { rows } = await this.pool.query<{ del_dia: string; dentro: string }>(
      `SELECT
         (SELECT count(*) FROM public.autorizaciones
           WHERE copropiedad_id = $1
             AND estado = 'activa'
             AND vigencia && tstzrange($2, $3, '[)'))                     AS del_dia,
         (SELECT greatest(0,
                   count(*) FILTER (WHERE tipo = 'ingreso')
                 - count(*) FILTER (WHERE tipo = 'salida'))
            FROM public.eventos
           WHERE copropiedad_id = $1
             AND ocurrido_en >= $2 AND ocurrido_en < $3
             AND resultado = 'permitido')                                 AS dentro`,
      [copropiedadId, ventana.desde, ventana.hasta],
    );
    const f = rows[0];
    return {
      autorizacionesDelDia: Number(f?.del_dia ?? 0),
      dentroAhora: Number(f?.dentro ?? 0),
    };
  }

  async conteosDeAlertas(copropiedadId: string): Promise<ConteosDeAlertas> {
    const { rows } = await this.pool.query<{ pendientes: string; severidad: string | null }>(
      // El orden por severidad se declara aquí y no se deduce del enumerado:
      // `max(severidad)` sobre un enum ordena por el orden de declaración, que
      // es un detalle del `CREATE TYPE` y no una decisión de producto.
      `SELECT count(*) AS pendientes,
              (ARRAY['critica','alta','media','informativa'])[
                min(array_position(ARRAY['critica','alta','media','informativa'],
                                   severidad::text))] AS severidad
         FROM public.alertas
        WHERE copropiedad_id = $1 AND estado <> 'resuelta'`,
      [copropiedadId],
    );
    const f = rows[0];
    return {
      pendientes: Number(f?.pendientes ?? 0),
      severidadMaxima: (f?.severidad ?? null) as SeveridadDeAlerta | null,
    };
  }

  async accesosPorHora(
    copropiedadId: string,
    ventana: VentanaDelDia,
  ): Promise<readonly FranjaDeAccesos[]> {
    const { rows } = await this.pool.query<{
      hora: string;
      permitidos: string;
      negados: string;
    }>(
      // La hora se extrae del instante YA convertido a la zona de la
      // copropiedad. Sin el `AT TIME ZONE`, el histograma sería el del huso del
      // servidor y las barras aparecerían corridas cinco horas en Colombia.
      `SELECT extract(hour FROM (ocurrido_en AT TIME ZONE $4))::int AS hora,
              count(*) FILTER (WHERE resultado = 'permitido')       AS permitidos,
              count(*) FILTER (WHERE resultado = 'negado')          AS negados
         FROM public.eventos
        WHERE copropiedad_id = $1
          AND ocurrido_en >= $2 AND ocurrido_en < $3
        GROUP BY 1
        ORDER BY 1`,
      [copropiedadId, ventana.desde, ventana.hasta, ventana.zonaHoraria],
    );
    return rows.map((f) => ({
      hora: Number(f.hora),
      permitidos: Number(f.permitidos),
      negados: Number(f.negados),
    }));
  }

  async dispositivos(copropiedadId: string): Promise<readonly DispositivoDelTablero[]> {
    const { rows } = await this.pool.query<{
      id: string;
      nombre: string;
      tipo: string;
      zona_id: string | null;
      host: string;
      puerto: number;
      modelo: string | null;
      firmware: string | null;
      ultimo_latido: Date | null;
      ultima_sincronizacion: Date | null;
    }>(
      // Columnas enumeradas una a una, jamás `*`: es lo que mantiene
      // `credencial_ref` fuera del proceso (RN-21).
      `SELECT id, nombre, tipo::text AS tipo, zona_id, host, puerto, modelo, firmware,
              ultimo_latido, ultima_sincronizacion
         FROM public.dispositivos
        WHERE copropiedad_id = $1 AND estado = 'activo'
        ORDER BY nombre`,
      [copropiedadId],
    );
    return rows.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      tipo: f.tipo,
      zonaId: f.zona_id,
      host: f.host,
      puerto: f.puerto,
      modelo: f.modelo,
      firmware: f.firmware,
      ultimoLatido: f.ultimo_latido,
      ultimaSincronizacion: f.ultima_sincronizacion,
    }));
  }
}

export { UMBRAL_DE_LATIDO_POR_DEFECTO };
