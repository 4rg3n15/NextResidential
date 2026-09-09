import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { crearApp, crearFirmante } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * EL ÚLTIMO TRAMO DEL ARRANQUE EN FRÍO: **¿puede entrar alguien?**
 *
 * `supabase/arranque-en-frio.sh` recorre base vacía → migraciones →
 * aprovisionamiento y comprueba que el gancho emite claims. Ahí se paraba, y
 * ese era el hueco: «tiene un rol» no es «puede entrar». Quien decide lo
 * segundo es el guard de la API, que es TypeScript y no SQL.
 *
 * El guion vuelca los claims que la base **realmente** produjo en
 * `.arranque-en-frio.json`; esta suite los toma tal cual y los mete por el
 * stack HTTP de verdad. Lo único simulado es la firma del token, que este
 * proyecto simula en todas sus pruebas desde la ETAPA 03 (`crearFirmante`).
 *
 * **Se OMITE si el fichero no existe**, porque exige una base PostgreSQL. Y una
 * omisión no es un verde: `verificar-etapa.sh --con-base` ejecuta el guion
 * antes, así que allí el fichero está y esta suite corre de verdad.
 */
/**
 * El guion escribe el fichero en la RAÍZ del repositorio; esta suite corre con
 * `cwd` en `apps/api` cuando se lanza por paquete y en la raíz cuando se lanza
 * por turbo. Resolver solo contra `process.cwd()` hacía que la suite se OMITIERA
 * en el primer caso — y una omisión silenciosa es exactamente el falso verde que
 * §2.8.0 persigue. Se sube por el árbol hasta encontrarlo.
 */
const localizarClaims = (): string | null => {
  // `NCR_CLAIMS_ARRANQUE` manda y **no admite respaldo**: es la variable con la
  // que el guion elige dónde escribir, y con la que las pruebas negativas
  // apuntan a claims mutados. Si estuviera puesta y aun así se subiera por el
  // árbol, la sonda mediría el fichero real en vez del suyo y no demostraría
  // nada — la familia de defectos de siempre.
  const declarado = process.env.NCR_CLAIMS_ARRANQUE;
  if (declarado !== undefined && declarado !== '') {
    const ruta = resolve(process.cwd(), declarado);
    return existsSync(ruta) ? ruta : null;
  }

  let directorio = process.cwd();
  for (let salto = 0; salto < 5; salto += 1) {
    const candidato = resolve(directorio, '.arranque-en-frio.json');
    if (existsSync(candidato)) return candidato;
    const padre = dirname(directorio);
    if (padre === directorio) break;
    directorio = padre;
  }
  return null;
};

const FICHERO = localizarClaims();
const hayClaims = FICHERO !== null;

interface ClaimsDeArranque {
  rol?: string;
  usuario_id?: string;
  copropiedad_id?: string | null;
  aud?: string;
}

const claims: ClaimsDeArranque =
  FICHERO !== null ? (JSON.parse(readFileSync(FICHERO, 'utf8')) as ClaimsDeArranque) : {};

let app: INestApplication;
let firmante: Firmante;

beforeAll(async () => {
  if (!hayClaims) return;
  firmante = await crearFirmante();
  app = await crearApp(firmante);
});
afterAll(async () => {
  await app?.close();
});

const tokenConAal = async (aal: 'aal1' | 'aal2'): Promise<string> =>
  firmante.emitir({
    sub: claims.usuario_id,
    usuario_id: claims.usuario_id,
    rol: claims.rol,
    copropiedad_id: claims.copropiedad_id ?? null,
    aal,
  });

describe.skipIf(!hayClaims)('el superadministrador recién aprovisionado PUEDE entrar', () => {
  it('los claims del fichero son los que la base produjo, no unos inventados', () => {
    // Si esta suite se montara sus propios claims, volvería a probar otra cosa.
    expect(claims.rol).toBe('superadministrador');
    expect(claims.usuario_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims).toHaveProperty('copropiedad_id');
  });

  it('con el segundo factor verificado, la API le abre', async () => {
    // ESTE es el criterio que faltaba. Todo lo anterior —copropiedad, usuario,
    // rol, claims— podía estar bien y el sistema seguir siendo inaccesible.
    const res = await request(app.getHttpServer())
      .get('/auth/sesion')
      .set('Authorization', `Bearer ${await tokenConAal('aal2')}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      rol: 'superadministrador',
      usuarioId: claims.usuario_id,
      mfaVerificado: true,
    });
  });

  it('sin segundo factor NO entra: el arranque no relajó RN-20', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/sesion')
      .set('Authorization', `Bearer ${await tokenConAal('aal1')}`);
    expect(res.status).toBe(401);
  });

  it('pero SÍ alcanza la recuperación del factor, que es lo que le desbloquea', async () => {
    // Sin esta ruta alcanzable con `aal1`, quien perdiera el teléfono se
    // quedaría fuera para siempre. Es la excepción declarada de §2.7.
    const res = await request(app.getHttpServer())
      .post('/auth/mfa/recuperacion')
      .set('Authorization', `Bearer ${await tokenConAal('aal1')}`)
      .send({ codigo: '00000-00000' });
    // 401 por código inválido —no hay códigos emitidos—, NO por falta de aal2.
    // Lo que se comprueba es que el guard la dejó pasar.
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).toContain('no válido');
  });

  it('el superadministrador alcanza una copropiedad cualquiera (alcance global)', async () => {
    const res = await request(app.getHttpServer())
      .get('/copropiedades/10000000-0000-4000-8000-000000000001')
      .set('Authorization', `Bearer ${await tokenConAal('aal2')}`);
    expect(res.status).toBe(200);
  });
});
