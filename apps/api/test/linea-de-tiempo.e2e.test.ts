import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { REPOSITORIO_EVENTOS_DE_EQUIPO } from '../src/eventos/aplicacion/eventos-de-equipo';
import { RepositorioEventosDeEquipoEnMemoria } from '../src/eventos/infraestructura/repositorios-en-memoria';

/**
 * 15-L (B2) · la línea de tiempo por HTTP: lo que llega a la consola, los
 * filtros que valida el DTO y la frontera del tenant. La suite de aislamiento
 * ya la recorre por enumeración; esta mira el contenido.
 */
let app: INestApplication;
let firmante: Firmante;
const EQUIPO = '90000000-0000-4000-8000-000000000001';
const repositorio = new RepositorioEventosDeEquipoEnMemoria();

const sembrar = async (copropiedadId: string, tipo: string, minuto: number): Promise<void> => {
  await repositorio.registrar({
    copropiedadId,
    dispositivoId: EQUIPO,
    tipo,
    titulo: tipo === 'puerta_forzada' ? 'Puerta forzada' : 'Timbre',
    codigoMayor: tipo === 'puerta_forzada' ? 5 : null,
    codigoMenor: tipo === 'puerta_forzada' ? 27 : null,
    origen: 'equipo',
    enVivo: true,
    ocurridoEn: new Date(Date.UTC(2026, 8, 27, 15, minuto)),
    horaDelEquipo: null,
    eventoId: null,
    claveIdempotencia: `${copropiedadId}:${tipo}:${String(minuto)}`,
    carga: {},
    creadoPor: 'prueba',
  });
};

beforeAll(async () => {
  firmante = await crearFirmante();
  await sembrar(COP_A, 'puerta_forzada', 1);
  await sembrar(COP_A, 'timbre', 2);
  await sembrar(COP_B, 'puerta_forzada', 3);
  app = await crearApp(firmante, (m) =>
    m.overrideProvider(REPOSITORIO_EVENTOS_DE_EQUIPO).useValue(repositorio),
  );
});

afterAll(async () => {
  await app.close();
});

const ruta = (cop: string, extra = ''): string =>
  `/copropiedades/${cop}/eventos/linea-de-tiempo?desde=2026-09-27T00:00:00Z&hasta=2026-09-28T00:00:00Z${extra}`;

describe('GET /copropiedades/:id/eventos/linea-de-tiempo', () => {
  it('el portero ve los eventos de SU copropiedad, con título y código', async () => {
    const token = await tokenDe(firmante, { rol: 'portero' });
    const r = await request(app.getHttpServer())
      .get(ruta(COP_A))
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    const elementos = r.body.elementos as { tipo: string; titulo: string; codigo: unknown }[];
    expect(elementos.map((e) => e.tipo)).toEqual(['timbre', 'puerta_forzada']);
    expect(elementos[1]).toMatchObject({
      titulo: 'Puerta forzada',
      codigo: { mayor: 5, menor: 27 },
    });
  });

  it('filtra por tipo y por equipo', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador' });
    const r = await request(app.getHttpServer())
      .get(ruta(COP_A, `&tipo=timbre&dispositivoId=${EQUIPO}&limite=10`))
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect((r.body.elementos as { tipo: string }[]).map((e) => e.tipo)).toEqual(['timbre']);
  });

  it.each([
    ['un tipo con mayúsculas o símbolos', '&tipo=Puerta;DROP'],
    ['un límite fuera de rango', '&limite=500'],
    ['un equipo que no es un UUID', '&dispositivoId=camara-1'],
    ['un campo no declarado', '&orden=asc'],
  ])('%s → 400', async (_caso, extra) => {
    const token = await tokenDe(firmante, { rol: 'administrador' });
    const r = await request(app.getHttpServer())
      .get(ruta(COP_A, extra))
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(400);
  });

  it('un rango al revés lo rechaza el caso de uso, no se devuelve vacío', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador' });
    const r = await request(app.getHttpServer())
      .get(
        `/copropiedades/${COP_A}/eventos/linea-de-tiempo?desde=2026-09-28T00:00:00Z&hasta=2026-09-27T00:00:00Z`,
      )
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(400);
  });

  it('otra copropiedad: nada de ella, ni por el filtro', async () => {
    const token = await tokenDe(firmante, { rol: 'portero' });
    const r = await request(app.getHttpServer())
      .get(ruta(COP_B))
      .set('Authorization', `Bearer ${token}`);
    expect([403, 404]).toContain(r.status);
    expect(JSON.stringify(r.body)).not.toMatch(/Puerta forzada/);
  });

  it('el residente no ve la línea de tiempo de la copropiedad', async () => {
    const token = await tokenDe(firmante, { rol: 'residente' });
    const r = await request(app.getHttpServer())
      .get(ruta(COP_A))
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(403);
  });
});
