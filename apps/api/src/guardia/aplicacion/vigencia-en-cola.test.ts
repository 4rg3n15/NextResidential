import { describe, expect, it } from 'vitest';
import { cargarConfiguracion } from '../../configuracion/esquema';
import { VIGENCIA_EN_COLA_POR_OMISION_S, construirCola } from './cola-de-atencion';
import type { AccesoReciente, MaterialDeLaCola } from './cola-de-atencion';
import { ConsultarColaDeAtencion } from './consultar-cola';

/**
 * D-144 · decisión del cliente (23/10): cada evento sale de la cola de la
 * guardia virtual una HORA después de ocurrir (antes, 5 minutos). Sólo cambia
 * cuánto permanece en la cola: el evento sigue en Eventos, que no se limpia
 * nunca para la administración (RN-03), y el escalamiento no se toca (RN-18).
 */
const AHORA = new Date(Date.UTC(2026, 9, 26, 15, 0, 0));
const MINUTO = 60;

const placaNegada = (id: string, haceSegundos: number): AccesoReciente => ({
  id,
  ocurridoEn: new Date(AHORA.getTime() - haceSegundos * 1000),
  resultado: 'negado',
  motivo: 'PLACA_DESCONOCIDA',
  metodo: 'placa',
  dispositivoId: 'disp-camara',
  viviendaId: null,
  placaDetectada: 'ABC123',
  evidenciaId: null,
});

const material = (accesos: readonly AccesoReciente[]): MaterialDeLaCola => ({
  accesos,
  eventosDeEquipo: [],
  atendidos: new Set(),
});

const entornoMinimo = {
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'valor-de-prueba',
  SUPABASE_SECRET_KEY: 'valor-de-prueba',
  SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
  DATABASE_URL: 'valor-de-prueba',
  DATABASE_POOLER_URL: 'valor-de-prueba',
  CORS_ALLOWED_ORIGINS: 'https://consola.ejemplo.co',
  INGESTA_FIRMA_SECRETO: 'secreto-de-prueba-de-treinta-y-dos-o-mas',
  BIOMETRIA_LLAVE: 'llave-de-prueba-de-treinta-y-dos-o-mas',
  EQUIPOS_LLAVE: 'llave-de-equipos-de-treinta-y-dos-o-mas',
};

describe('D-144 · la cola de la guardia retiene una hora', () => {
  it('por omisión, un evento de hace 59 minutos sigue y uno de hace 61 sale', () => {
    expect(VIGENCIA_EN_COLA_POR_OMISION_S).toBe(3600);
    const cola = construirCola(
      material([placaNegada('59', 59 * MINUTO), placaNegada('61', 61 * MINUTO)]),
      AHORA,
    );
    expect(cola.map((e) => e.id)).toEqual(['59']);
  });

  it('ConsultarCola usa la vigencia que le inyecta la configuración, no una constante', async () => {
    const pedidos: Date[] = [];
    const consultar = (vigencia: number) =>
      new ConsultarColaDeAtencion(
        {
          material: async (_c, desde) => {
            pedidos.push(desde);
            return material([placaNegada('59', 59 * MINUTO), placaNegada('61', 61 * MINUTO)]);
          },
        },
        { leer: async () => null, guardar: async () => undefined },
        { ahora: () => AHORA },
        vigencia,
      );
    const unaHora = await consultar(3600).ejecutar('cop');
    expect(unaHora.cola.map((e) => e.id)).toEqual(['59']);
    expect(unaHora.vigenciaSegundos).toBe(3600);
    const dosHoras = await consultar(7200).ejecutar('cop');
    expect(dosHoras.cola.map((e) => e.id).sort()).toEqual(['59', '61']);
  });
});

describe('D-144 · GUARDIA_VIGENCIA_EN_COLA_S se valida al arrancar', () => {
  const con = (valor?: string) =>
    cargarConfiguracion({
      ...entornoMinimo,
      ...(valor === undefined ? {} : { GUARDIA_VIGENCIA_EN_COLA_S: valor }),
    } as NodeJS.ProcessEnv);

  it('ausente o vacía vale una hora, la misma que la constante de la cola', () => {
    expect(con().GUARDIA_VIGENCIA_EN_COLA_S).toBe(VIGENCIA_EN_COLA_POR_OMISION_S);
    expect(con('').GUARDIA_VIGENCIA_EN_COLA_S).toBe(3600);
  });

  it('acepta de 60 a 86400 segundos', () => {
    expect(con('60').GUARDIA_VIGENCIA_EN_COLA_S).toBe(60);
    expect(con('86400').GUARDIA_VIGENCIA_EN_COLA_S).toBe(86_400);
  });

  it('fuera de rango o no entera, la API no arranca', () => {
    for (const malo of ['59', '86401', '90.5', 'una-hora']) {
      expect(() => con(malo), malo).toThrow();
    }
  });
});
