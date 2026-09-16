import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { RepositorioPadronPg } from '../src/padron/infraestructura/repositorio-pg';
import { CargarPadronDesdeArchivo, analizarCsv } from '../src/padron/aplicacion/carga-padron';
import { BuscarPersonas, DesactivarVivienda } from '../src/padron/aplicacion/casos-de-uso';
import type { LectorDeVocabulario } from '../src/padron/aplicacion/vocabulario';
import type { ContextoTenant } from '../src/autenticacion/dominio/claims';

/**
 * El vocabulario de la copropiedad de las semillas: «Casa» y «Manzana». Importa
 * que sea el de verdad, porque de él depende lo que el cargador recorta.
 */
const vocabulario: LectorDeVocabulario = {
  leer: async () => ({ tipo: 'casas', etiquetaVivienda: 'Casa', etiquetaAgrupacion: 'Manzana' }),
};

/**
 * D-72 · **el padrón se da de alta escribiendo nombres, contra base real.**
 *
 * La hoja pedía `vivienda_id` y `persona_id`: UUIDs que solo existen dentro de
 * la base. Nadie podía rellenarla, y sin padrón no se puede probar nada más.
 *
 * Lo que aquí importa no es que el caso de uso devuelva `aplicada: true` —eso
 * ya lo dicen las pruebas con dobles— sino que **las filas existan** y que la
 * misma cédula escrita de dos formas resuelva a UNA persona: es la garantía de
 * la que cuelga RN-06, y solo el índice único de PostgreSQL puede darla.
 *
 * Se OMITE si no hay base, y lo dice: una omisión no es un verde.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';

let pool: Pool | undefined;
let disponible = false;
let actorId = '';

const contexto = (): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'superadministrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

/** Sufijo propio de la corrida: la prueba no puede chocar consigo misma. */
const marca = String(Date.now()).slice(-8);

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

describe('carga de padrón por nombre y documento, contra base', () => {
  it('una hoja sin un solo UUID crea las viviendas, las personas y sus vínculos', async () => {
    if (!disponible || pool === undefined) {
      console.log('OMITIDA: sin DATABASE_URL_PRUEBAS o sin semillas. Se ejecuta en CI (ETAPA 14).');
      return;
    }
    const repo = new RepositorioPadronPg(pool, {});
    const casa = `D72-${marca}`;
    const documento = `10${marca}`;

    // Exactamente lo que un administrador escribe en Excel: ni un UUID. Y con
    // la palabra delante en una de las dos filas —«Casa D72-…»—, que es como
    // viene el archivo que el conjunto ya tenía: se guarda sin ella.
    const filas = analizarCsv(
      [
        'identificador,agrupacion,documento,nombre,placa,es_titular',
        `${casa},B,${documento},Ana Pérez,,true`,
        // La misma persona con el documento escrito con puntos, y un vehículo:
        // debe resolver a la MISMA fila de `personas` (RN-06). Y la misma
        // vivienda, aunque aquí lleve la palabra delante.
        `Casa ${casa},B,10.${marca.slice(0, 3)}.${marca.slice(3)},Ana Pérez,DTS${marca.slice(-3)},`,
      ].join('\n'),
    );

    const r = await new CargarPadronDesdeArchivo(repo, vocabulario).ejecutar(contexto(), filas);
    expect(r.aplicada, JSON.stringify(r.errores)).toBe(true);
    expect(r.aceptadas).toBe(2);
    // UNA vivienda, no dos: «D72-x» y «Casa D72-x» son la misma, y el recorte
    // se cuenta para que no sea silencioso (H-3).
    expect(r.viviendasCreadas).toBe(1);
    expect(r.identificadoresRecortados).toBe(1);
    // Dos filas, una sola persona: el documento es la identidad.
    expect(r.personasCreadas).toBe(1);

    const vivienda = await pool.query<{ id: string }>(
      `SELECT id FROM public.viviendas
        WHERE copropiedad_id = $1 AND identificador = $2 AND estado = 'activo'`,
      [COP, casa],
    );
    expect(vivienda.rowCount).toBe(1);

    const personas = await pool.query(
      `SELECT id FROM public.personas
        WHERE copropiedad_id = $1 AND numero_documento = $2 AND estado = 'activo'`,
      [COP, documento],
    );
    expect(personas.rowCount).toBe(1);

    // Y el buscador de la consola la encuentra por el nombre, que es por donde
    // la va a buscar quien autoriza.
    const encontradas = await new BuscarPersonas(repo).ejecutar(COP, 'Ana Pérez');
    expect(encontradas.ok && encontradas.valor.some((p) => p.numeroDocumento === documento)).toBe(
      true,
    );

    // Limpieza: baja LÓGICA de la vivienda. El `DELETE` lo prohíbe RN-19 con un
    // disparador, y ese rechazo es en sí la prueba de que la fila existía.
    const id = vivienda.rows[0]?.id ?? '';
    const baja = await new DesactivarVivienda(repo).ejecutar(
      contexto(),
      id,
      'Limpieza de la prueba automatizada de D-72',
    );
    expect(baja.ok).toBe(true);
  });

  it('una hoja con una vivienda inventada y otra correcta no deja NADA a medias', async () => {
    if (!disponible || pool === undefined) {
      console.log('OMITIDA: sin DATABASE_URL_PRUEBAS o sin semillas. Se ejecuta en CI (ETAPA 14).');
      return;
    }
    const repo = new RepositorioPadronPg(pool, {});
    const casa = `ROTA-${marca}`;
    const r = await new CargarPadronDesdeArchivo(repo, vocabulario).ejecutar(
      contexto(),
      analizarCsv(
        [
          'identificador,documento,nombre',
          `${casa},99${marca},Luis Gómez`,
          `,88${marca},Sin casa`,
        ].join('\n'),
      ),
    );
    expect(r.aplicada).toBe(false);

    // La fila buena tampoco entró: la carga es atómica (HU-03).
    const vivienda = await pool.query(
      'SELECT id FROM public.viviendas WHERE copropiedad_id = $1 AND identificador = $2',
      [COP, casa],
    );
    expect(vivienda.rowCount).toBe(0);
  });
});
