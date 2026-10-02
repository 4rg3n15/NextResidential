import type { Pool, PoolClient } from 'pg';
import type { Bitacora, Zona } from '@ncr/domain-core';
import { RepositorioListaNegraPg, autorizacionesVigentesEn } from '../../autorizaciones';
import type { RepositorioZonas } from '../../zonas';
import type { RepositorioCopropiedades } from '../../multiempresa/repositorio-copropiedades';
import { UMBRAL_CONFIANZA_PLACA_FRACCION } from '../../multiempresa/configuracion';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type {
  FuenteDeReglas,
  LecturasDeReglas,
  PlantillaLeida,
  VehiculoDelPadron,
  ZonaLeida,
} from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL MODELO DE LECTURA DE LA INSTANTÁNEA · 15-Q (Q1)
 *
 * Reúne de una copropiedad todo lo que el motor necesita, de una vez y sin
 * N+1: una consulta por colección. Lo que otro módulo YA sabe leer se le pide
 * a él —las autorizaciones con la lectura compartida del cargador, la lista
 * negra con su repositorio, las zonas con el suyo, el umbral con el catálogo—;
 * lo que nadie leía en bloque —el padrón de vehículos y las plantillas que una
 * terminal reconoce— se lee aquí, como el tablero lee lo que muestra (es un
 * modelo de lectura, no un repositorio de agregado: no escribe nada).
 *
 * TODO con la identidad de SERVICIO de la copropiedad que se le pasa, y quien
 * se la pasa (`PublicarInstantanea`) le pasa la de la IDENTIDAD del Edge,
 * nunca la de la ruta. Es la segunda barrera de RN-15, por construcción: aunque
 * la comprobación de la ruta (`AcreditarEdge`) faltara, un Edge sólo podría
 * leer lo de su propia copropiedad.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Las condiciones de `puedeReconocer` (dominio) que se pueden leer de la fila. */
const PLANTILLAS = `
  SELECT p.id AS plantilla_id, p.persona_id,
         CASE WHEN p.estado = 'activa'
               AND c.estado = 'vigente' AND c.otorgado_en IS NOT NULL AND c.revocado_en IS NULL
               AND c.persona_id = p.persona_id
              THEN p.suprimir_en END AS reconocible_hasta
    FROM public.plantillas_biometricas p
    LEFT JOIN public.consentimientos_biometricos c
      ON c.copropiedad_id = p.copropiedad_id AND c.id = p.consentimiento_id
   WHERE p.copropiedad_id = $1
     AND (p.estado <> 'suprimida' OR p.sincronizada_en IS NOT NULL)`;

const VEHICULOS = `
  SELECT ve.id, ve.placa, ve.vivienda_id, vi.estado::text AS vivienda_estado,
         vi.desactivado_en, ve.persona_id, ve.creado_en
    FROM public.vehiculos ve
    JOIN public.viviendas vi
      ON vi.copropiedad_id = ve.copropiedad_id AND vi.id = ve.vivienda_id
   WHERE ve.copropiedad_id = $1 AND ve.estado = 'activo'`;

const zonaLeida = (zona: Zona, ahora: Date): ZonaLeida => {
  const alDia = zona.conAforoAlDia(ahora);
  return {
    id: zona.id,
    abierta: zona.abierta && zona.activa,
    aforoMaximo: alDia.aforo.maximo,
    ocupacionActual: alDia.aforo.actual,
    desplazamientoUtcMinutos: zona.horario.desplazamientoUtcMinutos,
    franjas: zona.horario.franjas.map((f) => ({
      dia: f.dia,
      minutoInicio: f.minutoInicio,
      minutoFin: f.minutoFin,
      continuaDelDiaAnterior: f.continuaDelDiaAnterior,
    })),
  };
};

export class FuenteDeReglasPg implements FuenteDeReglas {
  constructor(
    private readonly pool: Pool,
    private readonly zonas: RepositorioZonas,
    private readonly copropiedades: RepositorioCopropiedades,
    private readonly bitacora: Bitacora,
  ) {}

  async leer(copropiedadId: string, ahora: Date): Promise<LecturasDeReglas> {
    const [propias, vetos, zonas, umbral] = await Promise.all([
      this.conServicio(copropiedadId, (c) => this.propias(c, copropiedadId, ahora)),
      new RepositorioListaNegraPg(this.pool, claimsDeServicio(copropiedadId)).activasDe(
        copropiedadId,
      ),
      this.zonas.listar(copropiedadId),
      this.umbral(copropiedadId),
    ]);
    return {
      ...propias,
      vetos: vetos.map((v) => ({ personaId: v.personaId, placa: v.placa })),
      zonas: zonas.map((z) => zonaLeida(z, ahora)),
      umbralDeConfianza: umbral,
    };
  }

  private conServicio<T>(copropiedadId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return conCliente(this.pool, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return await fn(c);
    });
  }

  /** Lo que se lee con el MISMO cliente: autorizaciones, padrón y plantillas. */
  private async propias(c: PoolClient, copropiedadId: string, ahora: Date) {
    const autorizaciones = await autorizacionesVigentesEn(c, copropiedadId, ahora);
    const vehiculos = await c.query<{
      id: string;
      placa: string;
      vivienda_id: string;
      vivienda_estado: string;
      desactivado_en: Date | null;
      persona_id: string | null;
      creado_en: Date;
    }>(VEHICULOS, [copropiedadId]);
    const viviendas = await c.query<{ id: string }>(
      `SELECT id FROM public.viviendas WHERE copropiedad_id = $1 AND estado = 'activo'`,
      [copropiedadId],
    );
    const plantillas = await c.query<{
      plantilla_id: string;
      persona_id: string;
      reconocible_hasta: Date | null;
    }>(PLANTILLAS, [copropiedadId]);
    return {
      autorizaciones,
      vehiculos: vehiculos.rows.map(
        (f): VehiculoDelPadron => ({
          placa: f.placa,
          vehiculoId: f.id,
          viviendaId: f.vivienda_id,
          viviendaActiva: f.vivienda_estado === 'activo',
          viviendaDesactivadaEn: f.desactivado_en,
          personaId: f.persona_id,
          registradoEn: f.creado_en,
        }),
      ),
      viviendasActivas: viviendas.rows.map((f) => f.id),
      plantillas: plantillas.rows.map(
        (f): PlantillaLeida => ({
          plantillaId: f.plantilla_id,
          personaId: f.persona_id,
          reconocibleHasta: f.reconocible_hasta,
        }),
      ),
    };
  }

  /** Como el cargador de la nube: sin umbral leído, el del contrato, y se dice. */
  private async umbral(copropiedadId: string): Promise<number> {
    try {
      return (
        (await this.copropiedades.umbralDeConfianzaPlaca(copropiedadId)) ??
        UMBRAL_CONFIANZA_PLACA_FRACCION
      );
    } catch (error) {
      this.bitacora.registrar(
        'aviso',
        'instantánea del Edge: umbral no leído, se usa el del contrato',
        {
          copropiedadId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return UMBRAL_CONFIANZA_PLACA_FRACCION;
    }
  }
}
