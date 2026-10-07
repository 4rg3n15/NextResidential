import type { Pool } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type {
  AltaDeRostro,
  ReemplazoDeRostro,
  ResultadoDeReemplazo,
} from '../aplicacion/puertos-del-rostro';
import { GUARDAR_CONSENTIMIENTO, parametrosDeConsentimiento } from './consentimiento-sql';
import { INSERTAR_PLANTILLA, parametrosDePlantilla } from './plantilla-sql';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · EL ALTA DEL ROSTRO DE UN RESIDENTE, EN UNA TRANSACCIÓN
 *
 * El consentimiento, la anterior a `pendiente_supresion` —con la supresión
 * para YA— y la nueva: juntos o nada. Optimista: se pasa la anterior que se
 * LEYÓ al empezar el registro, y si ya no está viva —otro registro de la misma
 * persona ganó entre medias— no se toca nada y se devuelve `ok: false` (409).
 *
 * Sin anterior, los dos índices únicos hacen lo mismo: de dos primeras
 * capturas simultáneas, la segunda choca con el consentimiento vigente de la
 * primera (`consent_vigente_uk`) o con su plantilla viva
 * (`plantillas_residente_viva_uk`, 0057). Así, de dos registros concurrentes
 * uno gana y el otro recibe 409: nunca dos rostros, nunca un 500, y nunca un
 * consentimiento vigente sin la plantilla que lo motivó.
 *
 * Los claims de servicio son LOCALES a la transacción (`set_config(…, true)`),
 * y la copropiedad va además en cada filtro (§2.7.6).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const VIVAS = `('pendiente_consentimiento', 'pendiente_sincronizacion', 'activa')`;
const QUIEN_GANO = new Set(['consent_vigente_uk', 'plantillas_residente_viva_uk']);

const otroRegistroGano = (error: unknown): boolean =>
  error !== null &&
  typeof error === 'object' &&
  (error as { code?: unknown }).code === '23505' &&
  QUIEN_GANO.has(String((error as { constraint?: unknown }).constraint));

export class ReemplazoDeRostroPg implements ReemplazoDeRostro {
  constructor(private readonly pool: Pool) {}

  async reemplazar(alta: AltaDeRostro): Promise<ResultadoDeReemplazo> {
    const { consentimiento, nueva, anteriorLeida, actorId, ahora } = alta;
    return conCliente(this.pool, async (c) => {
      await c.query('BEGIN');
      try {
        await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
          JSON.stringify(claimsDeServicio(nueva.copropiedadId)),
        ]);
        await c.query(GUARDAR_CONSENTIMIENTO, parametrosDeConsentimiento(consentimiento, actorId));
        if (anteriorLeida !== null) {
          const marcada = await c.query(
            `UPDATE public.plantillas_biometricas
                SET estado = 'pendiente_supresion',
                    suprimir_en = GREATEST($3::timestamptz, creado_en + interval '1 millisecond'),
                    actualizado_en = now(), actualizado_por = $4
              WHERE copropiedad_id = $1 AND id = $2 AND persona_id = $5
                AND autorizacion_id IS NULL AND estado IN ${VIVAS}`,
            [nueva.copropiedadId, anteriorLeida, ahora, actorId, nueva.titularId],
          );
          if (marcada.rowCount !== 1) {
            await c.query('ROLLBACK');
            return { ok: false };
          }
        }
        await c.query(INSERTAR_PLANTILLA, parametrosDePlantilla(nueva, actorId));
        await c.query('COMMIT');
        return { ok: true, reemplazada: anteriorLeida };
      } catch (error) {
        await c.query('ROLLBACK');
        if (otroRegistroGano(error)) return { ok: false };
        throw error;
      }
    });
  }
}
