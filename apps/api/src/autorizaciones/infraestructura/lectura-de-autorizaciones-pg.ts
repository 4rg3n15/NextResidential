import type { PoolClient } from 'pg';
import { Autorizacion, PatronRecurrencia, Placa, Vigencia, esExito } from '@ncr/domain-core';
import type { Acompanante } from '@ncr/domain-core';
import { desplazamientoDeZona } from './desplazamiento-de-zona';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA LECTURA DE AUTORIZACIONES PARA DECIDIR, ESCRITA UNA VEZ · 15-Q (Q1)
 *
 * Hasta la 15-Q vivía dentro de `activasParaLectura`, el único que decidía con
 * ella. Desde la 15-Q hay un segundo: la instantánea que el Edge descarga para
 * decidir sin WAN. RN-16 exige que el Edge y la nube decidan IGUAL, y lo que
 * más fácil los separa no es el motor —es el mismo `evaluarAcceso`— sino cómo
 * se reconstruye cada autorización: el patrón en hora local (H-15I-05), la
 * placa por el objeto de valor, el máximo de acompañantes. Dos copias de esta
 * función serían dos maneras de leer la misma fila; por eso se extrajo, y los
 * dos caminos la llaman con su propio filtro.
 *
 * El filtro es SIEMPRE una constante del llamador y los valores van por
 * parámetro (§2.7.4): esta función no concatena nada que venga de fuera.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Una placa guardada que no pase el objeto de valor se trata como ausente. */
export const placaDesde = (texto: string | null): Placa | null => {
  if (texto === null) return null;
  const placa = Placa.crear(texto);
  return esExito(placa) ? placa.valor : null;
};

export interface FilaDePatron {
  readonly dia_semana: number;
  readonly hora_inicio: string;
  readonly hora_fin: string;
}

/** Un patrón que existe y no se puede reconstruir: la autorización no se entrega. */
export const ILEGIBLE = Symbol('patrón ilegible');

export const horaAMinutos = (hora: string): number => {
  const [h, m] = hora.split(':');
  return Number(h ?? '0') * 60 + Number(m ?? '0');
};

/**
 * Decisión 5 (ETAPA 09-B) · las filas guardan hora LOCAL; el desplazamiento es
 * el de la zona de la copropiedad en `instante`. Sin filas no hay patrón
 * (`null`). Con filas que no se pueden reconstruir —zona irresoluble, franja
 * inválida— se devuelve ILEGIBLE y quien llama no entrega la autorización: el
 * motor la trata como inexistente y niega (§2.1.4).
 */
export const patronDesde = (
  filas: readonly FilaDePatron[],
  zona: string,
  instante: Date,
): PatronRecurrencia | null | typeof ILEGIBLE => {
  const primera = filas[0];
  if (primera === undefined) return null;
  const desplazamiento = desplazamientoDeZona(zona, instante);
  if (desplazamiento === null) return ILEGIBLE;
  const reconstruido = PatronRecurrencia.crear({
    // El dominio usa 0..6 con domingo=0; la base, ISO 1..7 con domingo=7.
    dias: filas.map((f) => (f.dia_semana === 7 ? 0 : f.dia_semana)),
    minutoInicio: horaAMinutos(primera.hora_inicio),
    minutoFin: horaAMinutos(primera.hora_fin),
    desplazamientoUtcMinutos: desplazamiento,
  });
  return esExito(reconstruido) ? reconstruido.valor : ILEGIBLE;
};

interface FilaDeLectura {
  readonly id: string;
  readonly vivienda_id: string;
  readonly persona_id: string;
  readonly desde: Date;
  readonly hasta: Date;
  readonly estado: string;
  readonly revocada_en: Date | null;
  readonly motivo_revocacion: string | null;
  readonly placa: string | null;
  readonly observaciones: string | null;
  readonly zonas: string[] | null;
  readonly acompanantes: { persona_id: string; nombre_completo: string }[] | null;
  readonly patron: FilaDePatron[] | null;
  readonly zona_horaria: string;
}

/** Los filtros admitidos: constantes, con `$1` = copropiedad y el resto por parámetro. */
export const FILTRO_PARA_LECTURA = `a.estado = 'activa'
            AND (($2::text IS NOT NULL AND a.placa = $2)
                 OR ($3::uuid IS NOT NULL AND v.persona_id = $3))
          ORDER BY upper(a.vigencia) DESC
          LIMIT 50`;
export const FILTRO_VIGENTES_EN = `a.estado = 'activa' AND upper(a.vigencia) > $2::timestamptz
          ORDER BY a.id`;

const SELECCION = `SELECT a.id, a.vivienda_id, v.persona_id,
                lower(a.vigencia) AS desde, upper(a.vigencia) AS hasta,
                a.estado::text AS estado, a.revocada_en, a.motivo_revocacion,
                a.placa, a.observaciones,
                (SELECT array_agg(z.zona_id) FROM public.autorizaciones_zona z
                  WHERE z.copropiedad_id = a.copropiedad_id AND z.autorizacion_id = a.id) AS zonas,
                (SELECT json_agg(json_build_object('persona_id', ac.persona_id,
                                                   'nombre_completo', p.nombre_completo))
                   FROM public.autorizacion_acompanantes ac
                   JOIN public.personas p
                     ON p.copropiedad_id = ac.copropiedad_id AND p.id = ac.persona_id
                  WHERE ac.copropiedad_id = a.copropiedad_id
                    AND ac.autorizacion_id = a.id) AS acompanantes,
                (SELECT json_agg(json_build_object('dia_semana', pr.dia_semana,
                                                   'hora_inicio', pr.hora_inicio::text,
                                                   'hora_fin', pr.hora_fin::text)
                                 ORDER BY pr.dia_semana)
                   FROM public.patrones_recurrencia pr
                  WHERE pr.copropiedad_id = a.copropiedad_id
                    AND pr.autorizacion_id = a.id) AS patron,
                co.zona_horaria
           FROM public.autorizaciones a
           JOIN public.visitantes v
             ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
           JOIN public.copropiedades co ON co.id = a.copropiedad_id
          WHERE a.copropiedad_id = $1
            AND `;

/**
 * Lee y rehidrata. `filtro` es una de las constantes de arriba, `parametros`
 * son sus `$2…`, y `ahora` es el instante con que se resuelve la zona horaria
 * del patrón (decisión 5).
 */
export const leerAutorizaciones = async (
  c: PoolClient,
  copropiedadId: string,
  filtro: typeof FILTRO_PARA_LECTURA | typeof FILTRO_VIGENTES_EN,
  parametros: readonly unknown[],
  ahora: Date,
): Promise<Autorizacion[]> => {
  const { rows } = await c.query<FilaDeLectura>(`${SELECCION}${filtro}`, [
    copropiedadId,
    ...parametros,
  ]);
  const salida: Autorizacion[] = [];
  for (const f of rows) {
    const vigencia = Vigencia.crear(f.desde, f.hasta);
    if (!esExito(vigencia)) continue;
    const patron = patronDesde(f.patron ?? [], f.zona_horaria, ahora);
    if (patron === ILEGIBLE) continue;
    const acompanantes: Acompanante[] = (f.acompanantes ?? []).map((x) => ({
      personaId: x.persona_id,
      nombre: x.nombre_completo,
    }));
    salida.push(
      Autorizacion.rehidratar({
        id: f.id,
        copropiedadId,
        viviendaId: f.vivienda_id,
        personaId: f.persona_id,
        vigencia: vigencia.valor,
        estado: f.estado === 'revocada' ? 'revocada' : 'vigente',
        acompanantes,
        zonasPermitidas: f.zonas ?? [],
        patron,
        maximoAcompanantes: Math.max(5, acompanantes.length),
        revocadaEn: f.revocada_en,
        motivoRevocacion: f.motivo_revocacion,
        placa: placaDesde(f.placa),
        observaciones: f.observaciones,
      }),
    );
  }
  return salida;
};

/** 15-Q · las autorizaciones que la instantánea del Edge lleva: activas y no vencidas en `ahora`. */
export const autorizacionesVigentesEn = (
  c: PoolClient,
  copropiedadId: string,
  ahora: Date,
): Promise<Autorizacion[]> =>
  leerAutorizaciones(c, copropiedadId, FILTRO_VIGENTES_EN, [ahora], ahora);
