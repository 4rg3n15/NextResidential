import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { RepositorioPadronPg } from '../src/padron/infraestructura/repositorio-pg';
import type { LectorDeVocabulario } from '../src/padron/aplicacion/vocabulario';
import {
  DesactivarVivienda,
  RegistrarResidente,
  RegistrarVivienda,
} from '../src/padron/aplicacion/casos-de-uso';
import type { ContextoTenant } from '../src/autenticacion/dominio/claims';

/**
 * D-71 · el superadministrador da de alta el padrón **contra base real**.
 *
 * La suite HTTP comprueba que el alcance ya no rechaza; ésta comprueba lo otro,
 * que es lo que el cliente necesita: que la fila **se escribe**. Con el defecto
 * vivo no se llegaba aquí —el caso de uso devolvía «La identidad no tiene
 * copropiedad» antes de tocar el repositorio— así que sin base no hay forma de
 * distinguir «arreglado» de «falla más tarde».
 *
 * Se OMITE si no hay base, y lo dice: una omisión no es un verde.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';

let pool: Pool | undefined;
let disponible = false;
let actorId = '';

/**
 * El contexto tal como lo produce `exigirAlcance` para un superadministrador:
 * su token trae `copropiedadId: null`, y el destino sale de la ruta ya
 * validado. Si alguien deshiciera D-71, este contexto volvería a llegar con
 * `null` y el caso de uso fallaría aquí mismo.
 */
const contextoDestino = (): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'superadministrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM public.usuarios WHERE copropiedad_id = $1 LIMIT 1',
      [COP],
    );
    actorId = rows[0]?.id ?? '';
    disponible = actorId !== '';
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
});

/**
 * Vocabulario del conjunto. Las semillas declaran «Casa» y «Manzana»; aquí se
 * usa una palabra que NO colisiona con los identificadores de la prueba, para
 * que lo que se mida sea el alta y no el recorte de la etiqueta —que tiene su
 * propia prueba.
 */
const vocabulario: LectorDeVocabulario = {
  leer: async () => ({
    tipo: 'apartamentos',
    etiquetaVivienda: 'Apartamento',
    etiquetaAgrupacion: 'Torre',
  }),
};

describe('alta de padrón con superadministrador, contra base', () => {
  it('crea una vivienda y devuelve su identificador', async () => {
    if (!disponible || pool === undefined) {
      console.log('OMITIDA: sin DATABASE_URL_PRUEBAS o sin semillas. Se ejecuta en CI (ETAPA 14).');
      return;
    }
    const repo = new RepositorioPadronPg(pool);
    const identificador = `TORRE-A-${String(Date.now()).slice(-8)}`;
    const r = await new RegistrarVivienda(repo, vocabulario).ejecutar(contextoDestino(), {
      identificador,
    });

    expect(r.ok, r.ok ? '' : `no se creó: ${r.error.detalle}`).toBe(true);
    if (!r.ok) return;

    const { rows } = await pool.query<{ copropiedad_id: string }>(
      'SELECT copropiedad_id FROM public.viviendas WHERE id = $1',
      [r.valor.id],
    );
    // La fila queda en LA COPROPIEDAD DEL SELECTOR, no en ninguna otra.
    expect(rows[0]?.copropiedad_id).toBe(COP);

    /**
     * Se limpia con la BAJA LÓGICA, no con `DELETE`.
     *
     * El primer intento de esta prueba borraba la fila y la base lo rechazó:
     * «Borrado físico prohibido en public.viviendas: use la baja lógica». Es
     * RN-19 funcionando —y es también la prueba de que la vivienda se creó de
     * verdad, porque el disparador saltó sobre una fila que existía—.
     */
    const baja = await new DesactivarVivienda(repo).ejecutar(
      contextoDestino(),
      r.valor.id,
      'Limpieza de la prueba automatizada de D-71',
    );
    expect(baja.ok).toBe(true);
  });

  it('y un residente sobre esa vivienda', async () => {
    if (!disponible || pool === undefined) {
      console.log('OMITIDA: sin DATABASE_URL_PRUEBAS o sin semillas. Se ejecuta en CI (ETAPA 14).');
      return;
    }
    const repo = new RepositorioPadronPg(pool);
    const vivienda = await new RegistrarVivienda(repo, vocabulario).ejecutar(contextoDestino(), {
      identificador: `TORRE-B-${String(Date.now()).slice(-8)}`,
    });
    expect(vivienda.ok).toBe(true);
    if (!vivienda.ok) return;

    // La persona ya existe en el padrón sembrado: el residente VINCULA una
    // persona a una vivienda, no crea la persona (D-01).
    // Una persona que NO sea ya residente activo de otra vivienda: esa
    // invariante existe (RN-04 para vehículos, su equivalente para residentes) y
    // el primer intento de esta prueba chocó con ella. Elegir a ciegas convierte
    // la prueba en intermitente según qué siembre la base.
    const { rows } = await pool.query<{ id: string }>(
      `SELECT p.id
         FROM public.personas p
    LEFT JOIN public.residentes r
           ON r.persona_id = p.id AND r.estado = 'activo'
        WHERE p.copropiedad_id = $1 AND r.id IS NULL
        LIMIT 1`,
      [COP],
    );
    const personaId = rows[0]?.id;
    if (personaId === undefined) {
      console.log('OMITIDA: no hay persona libre en la copropiedad sembrada.');
      return;
    }

    const residente = await new RegistrarResidente(repo).ejecutar(contextoDestino(), {
      viviendaId: vivienda.valor.id,
      personaId,
    });
    expect(residente.ok, residente.ok ? '' : `no se creó: ${residente.error.detalle}`).toBe(true);

    const baja = await new DesactivarVivienda(repo).ejecutar(
      contextoDestino(),
      vivienda.valor.id,
      'Limpieza de la prueba automatizada de D-71',
    );
    expect(baja.ok).toBe(true);
  });
});
