import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { FACE_TEMPLATE_PROVIDER } from '@ncr/domain-core';
import type { FaceTemplateProvider } from '@ncr/domain-core';
import { capacidadesDescubiertas } from '@ncr/providers';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { COP_A, COP_B } from './utilidades';
import { bancoDelHogar } from './banco-del-hogar-pg';
import type { Sesion } from './banco-del-hogar-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · D6 · EL RESIDENTE REVOCA SUS PROPIAS VISITAS (D-W6, RN-11)
 *
 * Antes, `POST …/autorizaciones/:id/revocacion` no admitía al residente: una
 * visita autorizada por error seguía vigente hasta que la anulara portería. Ahora
 * la revoca él, con motivo, y el rostro del visitante sale de las terminales EN
 * EL ACTO (`SuprimirRostroDeAutorizacion`). La visita se busca por la vivienda
 * del ámbito en el propio SQL: la del vecino y la de otra copropiedad, 404.
 * No hay ruta que cambie fechas: para otra vigencia, se revoca y se autoriza.
 *
 * Contra la base real, con una terminal facial simulada que anota lo que
 * recibe y lo que se le retira.
 * ═════════════════════════════════════════════════════════════════════════════
 */
class TerminalesSimuladas implements FaceTemplateProvider {
  readonly recibidas: string[] = [];
  readonly retiradas: string[] = [];
  async sincronizar(dispositivoId: string, plantillaId: string): Promise<void> {
    this.recibidas.push(`${dispositivoId}/${plantillaId}`);
  }
  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    this.retiradas.push(`${dispositivoId}/${plantillaId}`);
  }
}

const ADMIN = '00000000-0000-4000-8000-000000000010';
const LLAVE_EQUIPOS = 'llave-de-equipos-solo-para-pruebas-32+';
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();
const terminales = new TerminalesSimuladas();
const ctxAdmin = {
  usuarioId: ADMIN,
  rol: 'administrador' as const,
  copropiedadId: COP_A,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};
let terminal = '';
let equipos: RepositorioDeEquiposPg | undefined;

const banco = bancoDelHogar('sin DATABASE_URL_PRUEBAS o sin las migraciones 0055 y 0056', {
  sustituir: (b) => b.overrideProvider(FACE_TEMPLATE_PROVIDER).useValue(terminales),
  configuracion: { CARGADOR_DE_CONTEXTO: 'postgres' },
  montar: async (pool) => {
    equipos = new RepositorioDeEquiposPg(pool, LLAVE_EQUIPOS, 'env:EQUIPOS_LLAVE');
    const creado = await equipos.crear(
      ctxAdmin,
      COP_A,
      {
        nombre: `Terminal revocación ${CORRIDA}`,
        tipo: 'terminal_facial',
        host: `terminal-revocacion-${CORRIDA.toLowerCase()}.invalid`,
        puerto: 80,
        protocolo: 'http',
        usuario: 'servicio',
        secreto: 'clave-de-pruebas-1',
      },
      {
        clase: 'alcanzado',
        detalle: 'responde',
        modelo: 'M',
        firmware: 'V0',
        latenciaMs: 1,
        verificado: true,
        capacidades: capacidadesDescubiertas({
          bibliotecaDeRostros: { estado: 'si', maximo: 100, almacenadas: 0 },
        }),
      },
    );
    terminal = creado.id;
    return { repositorio: equipos };
  },
});
const omitida = (): boolean => !banco.disponible;
// 15-S5 · DT-15M-C01 · la terminal de la corrida se da de baja, como en `visitas-pg`:
// cada corrida dejaba una terminal facial activa más en COP_A, y la foto de una
// visita —y su retirada— va a TODAS (RN-19: baja lógica, nunca borrado).
afterAll(async () => {
  if (banco.disponible && equipos !== undefined && terminal !== '') {
    await equipos.desactivar(ctxAdmin, COP_A, terminal, 'fin de la prueba de revocación');
  }
});

/** Un JPEG mínimo: los bytes de cabecera y de cierre que el tipo real exige. */
const jpeg = (): string =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    randomBytes(96),
    Buffer.from([0xff, 0xd9]),
  ]).toString('base64');
const visita = (n: number) => ({
  nombre: `Visitante ${CORRIDA} ${String(n)}`,
  documento: `8${CORRIDA.replace(/\D/g, '5')}${String(n)}`.slice(0, 12),
  inicio: new Date(Date.now() - 5 * 60_000).toISOString(),
  duracionMinutos: 120,
  foto: {
    contenidoBase64: jpeg(),
    tipoMime: 'image/jpeg',
    medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
  },
  casillaMarcada: true,
  claveDeIdempotencia: `revocacion-${CORRIDA}-${randomUUID()}`,
});

describe('15-W · D6 · revocar una visita propia', () => {
  const s = banco.sufijo;
  let suyo: Sesion = { usuarioId: '', token: '' };
  let vecino: Sesion = { usuarioId: '', token: '' };
  let visitaId = '';
  let plantilla = '';
  const ruta = (id: string, cop = COP_A) => `/copropiedades/${cop}/mi/visitas/${id}/revocacion`;

  it('prepara: dos viviendas con su titular; la de 1 autoriza una visita con foto', async () => {
    if (omitida()) return;
    suyo = await banco.titular(COP_A, await banco.vivienda(COP_A, `V${s}`), `rev1.${s}`);
    await banco.completarAlta(COP_A, suyo.token, banco.perfil(1));
    vecino = await banco.titular(COP_A, await banco.vivienda(COP_A, `X${s}`), `rev2.${s}`);
    await banco.completarAlta(COP_A, vecino.token, banco.perfil(2));
    const r = await banco.con(suyo.token, 'post', `/copropiedades/${COP_A}/mi/visitas`, visita(1));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    visitaId = r.body.id as string;
    const p = await banco.uno<{ id: string }>(
      'SELECT id::text FROM public.plantillas_biometricas WHERE autorizacion_id = $1',
      [visitaId],
    );
    plantilla = p?.id ?? '';
    expect(terminales.recibidas).toContain(`${terminal}/${plantilla}`);
  });

  it('sin motivo, o con uno de más de 200, no hay revocación: 400', async () => {
    if (omitida()) return;
    expect((await banco.con(suyo.token, 'post', ruta(visitaId), {})).status).toBe(400);
    expect((await banco.con(suyo.token, 'post', ruta(visitaId), { motivo: '   ' })).status).toBe(
      400,
    );
    expect(
      (await banco.con(suyo.token, 'post', ruta(visitaId), { motivo: 'x'.repeat(201) })).status,
    ).toBe(400);
    expect(
      (await banco.con(suyo.token, 'post', ruta(visitaId), { motivo: 'Error', viviendaId: COP_A }))
        .status,
    ).toBe(400);
  });

  it('la del vecino y la de otra copropiedad: 404, y no se toca nada', async () => {
    if (omitida()) return;
    expect(
      (await banco.con(vecino.token, 'post', ruta(visitaId), { motivo: 'No es mía' })).status,
    ).toBe(404);
    expect(
      (await banco.con(suyo.token, 'post', ruta(visitaId, COP_B), { motivo: 'Cruzado' })).status,
    ).toBe(404);
    // Una visita de El Roble pedida por su identificador desde Mira: el SQL no la ve.
    const roble = await banco.titular(COP_B, await banco.vivienda(COP_B, `Y${s}`), `rev3.${s}`);
    await banco.completarAlta(COP_B, roble.token, banco.perfil(3));
    const deRoble = await banco.con(
      roble.token,
      'post',
      `/copropiedades/${COP_B}/mi/autorizaciones`,
      {
        visitante: `Visitante de El Roble ${s}`,
        desde: new Date(Date.now() + 60_000).toISOString(),
        hasta: new Date(Date.now() + 3_600_000).toISOString(),
        claveDeIdempotencia: `roble-${CORRIDA}`,
      },
    );
    expect(deRoble.body.creada, JSON.stringify(deRoble.body)).toBe(true);
    expect(
      (await banco.con(suyo.token, 'post', ruta(String(deRoble.body.id)), { motivo: 'Ajena' }))
        .status,
    ).toBe(404);
    const estado = await banco.uno<{ estado: string }>(
      'SELECT estado::text FROM public.autorizaciones WHERE id = $1',
      [visitaId],
    );
    expect(estado?.estado).not.toBe('revocada');
    expect(terminales.retiradas).not.toContain(`${terminal}/${plantilla}`);
  });

  it('la suya: revocada con motivo y el rostro fuera de las terminales en el acto; repetir es 409', async () => {
    if (omitida()) return;
    const r = await banco.con(suyo.token, 'post', ruta(visitaId), {
      motivo: '  Se canceló la visita ',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ revocada: true, rostrosSuprimidos: 1 });
    expect(terminales.retiradas).toContain(`${terminal}/${plantilla}`);
    expect(
      await banco.uno(
        `SELECT a.estado::text AS estado,
                (SELECT b.detalle FROM public.bitacora_de_residentes b
                  WHERE b.tipo = 'visita_revocada_por_residente' AND b.actor_id = $2
                  ORDER BY b.ocurrido_en DESC LIMIT 1) AS rastro
           FROM public.autorizaciones a WHERE a.id = $1`,
        [visitaId, suyo.usuarioId],
      ),
    ).toEqual({ estado: 'revocada', rastro: `autorización ${visitaId} · Se canceló la visita` });
    const otraVez = await banco.con(suyo.token, 'post', ruta(visitaId), { motivo: 'Otra vez' });
    expect(otraVez.status).toBe(409);
    expect(JSON.stringify(otraVez.body)).toContain('ya está revocada');
  });

  it('no existe ninguna ruta del residente que cambie las fechas de una visita', async () => {
    if (omitida()) return;
    for (const metodo of ['put', 'patch'] as const) {
      const r = await banco.con(
        suyo.token,
        metodo,
        `/copropiedades/${COP_A}/mi/visitas/${visitaId}`,
        {
          inicio: new Date().toISOString(),
        },
      );
      expect(r.status, metodo).toBe(404);
    }
  });
});
