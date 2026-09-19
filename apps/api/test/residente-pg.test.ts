import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { DirectorioDelResidentePg } from '../src/residente/infraestructura/directorio-pg';
import { AutorizacionesDelResidentePg } from '../src/residente/infraestructura/autorizaciones-pg';

/**
 * LOS ADAPTADORES DEL RESIDENTE CONTRA POSTGRESQL DE VERDAD.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE ESTA SUITE · D-89, encontrado al escribir 11-B
 *
 * La suite de aislamiento del residente —la que rompe el build si un residente
 * alcanza al vecino— monta la aplicación con un **doble en memoria** del
 * directorio. Es lo correcto para lo que prueba: el filtro vive en la capa de
 * aplicación y el doble lo deja al desnudo.
 *
 * Y deja sin ejercer el adaptador entero. Lo que apareció al mirar: la consulta
 * de `vinculoDe` unía `public.niveles_de_acceso`, **una tabla que no existe**
 * —se llama `niveles_acceso`—. Es decir, en 11-A **ninguna lectura del
 * residente funcionaba contra una base real**, y la suite estaba en verde:
 * 1.519 pruebas, incluidas las del segundo eje de aislamiento, todas pasando
 * sobre un doble que no conoce el esquema.
 *
 * Es otra vez la familia: el control existe, y no comprueba lo que uno cree.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ AFIRMA, Y QUÉ NO
 *
 * Afirma que **el SQL de estos adaptadores encaja con el esquema migrado**:
 * las tablas existen, las columnas existen, los tipos ligan y las funciones de
 * `app.` están donde se las llama. Para eso no hacen falta datos: se llama con
 * identificadores que no existen y se exige que la respuesta sea vacía, no un
 * error. Un `42P01` (tabla inexistente) o un `42703` (columna inexistente)
 * **rompe**.
 *
 * NO afirma que los datos sean los correctos: de eso responden la suite de
 * aislamiento y las pruebas de caso de uso, que sí tienen datos gobernados.
 *
 * Se OMITE sin `DATABASE_URL_PRUEBAS`, y cuando se omite lo dice: la omisión no
 * es un verde, y el paso 13 del verificador exige que esté la base.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-0000000000aa';
const VIVIENDA = '20000000-0000-4000-8000-0000000000aa';
const USUARIO = '00000000-0000-4000-8000-0000000000aa';
const AMBITO = { copropiedadId: COP, viviendaId: VIVIENDA };

let pool: Pool | undefined;
let disponible = false;

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    pool = new Pool({ connectionString: URL_BASE, max: 4 });
    await pool.query('SELECT 1');
    disponible = true;
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await pool?.end();
});

/** Los códigos que delatan un desajuste con el esquema, no un dato ausente. */
const DESAJUSTE = new Set([
  '42P01', // undefined_table
  '42703', // undefined_column
  '42883', // undefined_function
  '42804', // datatype_mismatch
  '42P10', // invalid_column_reference (un ON CONFLICT que no casa con su índice)
]);

const sinDesajuste = async (que: string, fn: () => Promise<unknown>): Promise<void> => {
  try {
    await fn();
  } catch (e) {
    const codigo = (e as { code?: string }).code ?? '';
    if (DESAJUSTE.has(codigo)) {
      throw new Error(
        `${que}: el SQL no encaja con el esquema migrado (${codigo}) — ${(e as Error).message}`,
      );
    }
    // Cualquier otro error —una clave ajena que no existe, por ejemplo— es un
    // dato ausente y no un desajuste: es lo esperado con identificadores
    // inventados, y no es lo que esta suite juzga.
  }
};

describe('adaptadores del residente · el SQL encaja con el esquema migrado (D-89)', () => {
  it.runIf(URL_BASE !== undefined)('las seis lecturas del directorio se ejecutan', async () => {
    expect(disponible, 'DATABASE_URL_PRUEBAS definida pero la base no contesta').toBe(true);
    const d = new DirectorioDelResidentePg(pool as Pool, { usuario_id: USUARIO });

    await sinDesajuste('vinculoDe', () => d.vinculoDe(USUARIO));
    await sinDesajuste('vivienda', () => d.vivienda(AMBITO));
    await sinDesajuste('familia', () => d.familia(AMBITO));
    await sinDesajuste('vehiculos', () => d.vehiculos(AMBITO));
    await sinDesajuste('autorizaciones', () => d.autorizaciones(AMBITO));
    await sinDesajuste('historial', () => d.historial(AMBITO, { periodo: 'mes', limite: 20 }));
  });

  it.runIf(URL_BASE !== undefined)(
    'y devuelven vacío, no basura, con datos que no existen',
    async () => {
      expect(disponible).toBe(true);
      const d = new DirectorioDelResidentePg(pool as Pool, { usuario_id: USUARIO });
      expect(await d.vinculoDe(USUARIO)).toBeNull();
      expect(await d.vivienda(AMBITO)).toBeNull();
      expect(await d.familia(AMBITO)).toEqual([]);
    },
  );

  it.runIf(URL_BASE !== undefined)(
    'los hechos para autorizar se responden en una consulta',
    async () => {
      expect(disponible).toBe(true);
      const a = new AutorizacionesDelResidentePg(pool as Pool, { usuario_id: USUARIO });

      // Con un conjunto que no existe, los tres hechos son los conservadores:
      // nadie vetado, vivienda NO activa, placa no tomada. Que `viviendaActiva`
      // sea `false` y no `true` es la dirección segura de §2.1.4.
      const hechos = await a.hechosParaAutorizar(AMBITO, {
        documento: '1020304050',
        placa: 'ABC123',
      });
      expect(hechos).toEqual({
        visitanteVetado: false,
        viviendaActiva: false,
        placaYaActiva: false,
      });
    },
  );

  it.runIf(URL_BASE !== undefined)(
    'la escritura llega hasta la clave ajena, no muere en el esquema',
    async () => {
      expect(disponible).toBe(true);
      const a = new AutorizacionesDelResidentePg(pool as Pool, { usuario_id: USUARIO });

      /**
       * Aquí se comprueba lo más difícil de ver de otro modo: que el INSERT de
       * cuatro tablas, el `ON CONFLICT` sobre un índice PARCIAL y las funciones
       * `app.normalizar_*` existen y ligan. La transacción falla —la copropiedad
       * inventada no está—, y ESE fallo es el esperado: lo que no puede aparecer
       * es un desajuste de esquema.
       */
      await sinDesajuste('crearAutorizacion', () =>
        a.crearAutorizacion(
          AMBITO,
          { usuarioId: USUARIO, residenteId: USUARIO },
          {
            visitante: 'Visitante de prueba',
            documento: '1020304050',
            desde: new Date(Date.now() + 60_000).toISOString(),
            hasta: new Date(Date.now() + 3_600_000).toISOString(),
            placa: 'ABC123',
            permiteAccesoVehicular: true,
            acompanantes: ['Acompañante de prueba'],
            zonasPermitidas: [],
            observaciones: 'sin observaciones',
            patron: null,
            claveDeIdempotencia: 'clave-de-prueba-0001',
          },
        ),
      );
    },
  );
});
