import { describe, expect, it } from 'vitest';
import {
  AjustesDePlataformaEnMemoria,
  RegistroDePresenciaEnMemoria,
  RegistroDeSeguridadEnMemoria,
  ReglasDeIpEnMemoria,
} from '../infraestructura/plataforma-en-memoria';
import { ControlDeIpDePorteros, VENTANA_DE_SESION_ACTIVA_MS } from './control-de-ip';
import { ModoPruebas, VIGENCIA_DEL_MODO_MS } from './modo-pruebas';
import { MENSAJE_GUARDIA_REMOTA, evaluarIpDePortero, ipEnRedes, redValida } from './politica-de-ip';
import {
  IntentosDeAcceso,
  MAXIMO_DE_FALLOS,
  PresenciaDeSuperadministrador,
  VENTANA_DE_BLOQUEO_MS,
} from './presencia-y-intentos';
import type { AjustesDePlataforma } from './puertos';

/**
 * H4 · H5 (15-L, ADR-031) · la regla de IP, el modo pruebas, la presencia del
 * superadministrador y los intentos fallidos, sin base y con reloj a mano. Los
 * doce casos de punta a punta están en `test/porteros-por-identificador-pg.test.ts`.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const PORTERO = '60000000-0000-4000-8000-000000000001';

const reloj = (inicio = 1_000_000) => {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
};

describe('política de IP del portero (H4)', () => {
  it('reconoce IPv4, IPv6, redes CIDR y la forma IPv4 dentro de IPv6', () => {
    expect(ipEnRedes('198.51.100.7', ['198.51.100.0/28'])).toBe(true);
    expect(ipEnRedes('198.51.100.17', ['198.51.100.0/28'])).toBe(false);
    expect(ipEnRedes('::ffff:192.0.2.5', ['192.0.2.5'])).toBe(true);
    expect(ipEnRedes('2001:db8::9', ['2001:db8::/64'])).toBe(true);
    expect(ipEnRedes('no-es-ip', ['192.0.2.0/24'])).toBe(false);
    // Lo ilegible en la lista no deja pasar nada, ni rompe.
    expect(ipEnRedes('192.0.2.5', ['basura', '192.0.2.5'])).toBe(true);
  });

  it('valida y normaliza lo que el superadministrador escribe', () => {
    expect(redValida(' 198.51.100.0/24 ')).toBe('198.51.100.0/24');
    expect(redValida('2001:DB8::1')).toBe('2001:db8::1');
    for (const malo of [
      '198.51.100.0/33',
      '2001:db8::/129',
      '1.2.3',
      '192.0.2.1/2/3',
      'x/8',
      '192.0.2.1/a',
    ]) {
      expect(redValida(malo), malo).toBeNull();
    }
  });

  const vacias = { ipsPorteria: [], ipsRemotas: [] };

  it('lista remota con entradas: sólo desde ellas; la regla del superadministrador no aplica', () => {
    const reglas = { ipsPorteria: [], ipsRemotas: ['198.51.100.0/28'] };
    const base = { reglas, ipsDeSuperadministrador: ['203.0.113.60'], soloRemota: true };
    expect(evaluarIpDePortero({ ...base, ip: '198.51.100.5' })).toEqual({
      permitido: true,
      via: 'remota',
    });
    expect(evaluarIpDePortero({ ...base, ip: '203.0.113.60' }).permitido).toBe(false);
  });

  it('lista remota vacía: desde la IP de un superadministrador activo, y de ninguna otra', () => {
    const base = { reglas: vacias, ipsDeSuperadministrador: ['203.0.113.60'], soloRemota: true };
    expect(evaluarIpDePortero({ ...base, ip: '203.0.113.60' }).via).toBe('superadministrador');
    expect(evaluarIpDePortero({ ...base, ip: '203.0.113.61' }).permitido).toBe(false);
  });

  it('la IP de portería sirve para la consola presencial, no para la guardia remota', () => {
    const reglas = { ipsPorteria: ['192.0.2.10'], ipsRemotas: ['198.51.100.0/28'] };
    const base = { reglas, ipsDeSuperadministrador: [], ip: '192.0.2.10' };
    expect(evaluarIpDePortero({ ...base, soloRemota: false }).via).toBe('porteria');
    expect(evaluarIpDePortero({ ...base, soloRemota: true }).permitido).toBe(false);
  });

  it('sin IP, o con una ilegible, no entra', () => {
    const base = { reglas: vacias, ipsDeSuperadministrador: [], soloRemota: false };
    expect(evaluarIpDePortero({ ...base, ip: null }).permitido).toBe(false);
    expect(evaluarIpDePortero({ ...base, ip: 'desconocida' }).permitido).toBe(false);
  });
});

describe('modo pruebas (H5)', () => {
  it('se relee pasado su plazo, y un cambio aquí surte efecto en el acto', async () => {
    const r = reloj();
    const ajustes = new AjustesDePlataformaEnMemoria();
    const modo = new ModoPruebas(ajustes, r.ahora);
    expect(await modo.activo()).toBe(true);
    await ajustes.fijarModoPruebas(false, 'otro-proceso');
    expect(await modo.activo()).toBe(true); // aún en caché
    r.avanzar(VIGENCIA_DEL_MODO_MS);
    expect(await modo.activo()).toBe(false);
    await modo.cambiar(true, 'super', null);
    expect(await modo.activo()).toBe(true);
    expect(ajustes.cambios.at(-1)).toEqual({ activo: true, actorId: 'super' });
  });

  it('si la base no contesta, vale lo último leído; sin lectura previa, INACTIVO', async () => {
    const r = reloj();
    let falla = false;
    const ajustes: AjustesDePlataforma = {
      modoPruebas: async () => {
        if (falla) throw new Error('sin base');
        return true;
      },
      fijarModoPruebas: async () => undefined,
    };
    const nuevo = new ModoPruebas(
      { ...ajustes, modoPruebas: async () => Promise.reject(new Error('x')) },
      r.ahora,
    );
    expect(await nuevo.activo()).toBe(false);
    const modo = new ModoPruebas(ajustes, r.ahora);
    expect(await modo.activo()).toBe(true);
    falla = true;
    r.avanzar(VIGENCIA_DEL_MODO_MS + 1);
    expect(await modo.activo()).toBe(true);
  });
});

describe('control de IP en cada petición (H4 · H5)', () => {
  const montar = async (activo: boolean) => {
    const r = reloj();
    const ajustes = new AjustesDePlataformaEnMemoria();
    await ajustes.fijarModoPruebas(activo, 'suite');
    const reglas = new ReglasDeIpEnMemoria();
    const presencia = new RegistroDePresenciaEnMemoria();
    const seguridad = new RegistroDeSeguridadEnMemoria();
    const control = new ControlDeIpDePorteros(
      reglas,
      presencia,
      new ModoPruebas(ajustes, r.ahora),
      seguridad,
      r.ahora,
    );
    return { r, reglas, presencia, seguridad, control };
  };
  const peticion = (ip: string) => ({
    copropiedadId: COP,
    usuarioId: PORTERO,
    ip,
    agente: 'navegador',
    soloRemota: true,
    recurso: 'GET /copropiedades/:id/guardia/cola',
  });

  it('fuera de la lista: 403 con el texto exacto y la fila en la auditoría', async () => {
    const { reglas, seguridad, control } = await montar(false);
    reglas.fijar(COP, { ipsPorteria: [], ipsRemotas: ['198.51.100.0/28'] });
    expect(await control.evaluar(peticion('203.0.113.20'))).toEqual({
      permitido: false,
      mensaje: MENSAJE_GUARDIA_REMOTA,
    });
    expect(seguridad.eventos).toMatchObject([
      { tipo: 'restriccion_de_ip', ip: '203.0.113.20', resultado: '403', copropiedadId: COP },
    ]);
  });

  it('las reglas se releen a los pocos segundos: quitar una IP corta sin reiniciar', async () => {
    const { r, reglas, control } = await montar(false);
    reglas.fijar(COP, { ipsPorteria: [], ipsRemotas: ['198.51.100.5'] });
    expect((await control.evaluar(peticion('198.51.100.5'))).permitido).toBe(true);
    reglas.fijar(COP, { ipsPorteria: [], ipsRemotas: ['198.51.100.6'] });
    expect((await control.evaluar(peticion('198.51.100.5'))).permitido).toBe(true);
    r.avanzar(5000);
    expect((await control.evaluar(peticion('198.51.100.5'))).permitido).toBe(false);
  });

  it('la sesión del superadministrador cuenta mientras está activa, y ya no pasada la ventana', async () => {
    const { r, presencia, control } = await montar(false);
    await presencia.anotar({ sesionId: 's', ip: '203.0.113.60', ahora: new Date(r.ahora()) });
    expect((await control.evaluar(peticion('203.0.113.60'))).permitido).toBe(true);
    r.avanzar(VENTANA_DE_SESION_ACTIVA_MS + 1);
    expect((await control.evaluar(peticion('203.0.113.60'))).permitido).toBe(false);
  });

  it('con el modo pruebas: entra, «habría sido rechazado», una fila cada cinco minutos', async () => {
    const { r, reglas, seguridad, control } = await montar(true);
    reglas.fijar(COP, { ipsPorteria: [], ipsRemotas: ['198.51.100.0/28'] });
    expect(await control.evaluar(peticion('203.0.113.20'))).toEqual({
      permitido: true,
      habriaSidoRechazado: true,
    });
    await control.evaluar(peticion('203.0.113.20'));
    expect(seguridad.eventos).toHaveLength(1);
    expect(seguridad.eventos[0]).toMatchObject({
      resultado: 'permitido',
      recurso: 'GET /copropiedades/:id/guardia/cola · habría sido rechazado (modo pruebas)',
    });
    r.avanzar(5 * 60_000);
    await control.evaluar(peticion('203.0.113.20'));
    expect(seguridad.eventos).toHaveLength(2);
  });
});

describe('presencia del superadministrador e intentos fallidos (H4 b · H5)', () => {
  it('la presencia se escribe como mucho una vez por minuto, y el cierre la retira', async () => {
    const r = reloj();
    const registro = new RegistroDePresenciaEnMemoria();
    const presencia = new PresenciaDeSuperadministrador(registro, r.ahora);
    await presencia.anotar('s1', 'super', '203.0.113.60');
    r.avanzar(30_000);
    await presencia.anotar('s1', 'super', '203.0.113.60');
    expect(await registro.ipsActivas(new Date(0))).toEqual(['203.0.113.60']);
    await presencia.cerrar('s1');
    expect(await registro.ipsActivas(new Date(0))).toEqual([]);
    // Cerrada, no revive con una petición tardía de la misma sesión.
    r.avanzar(60_000);
    await presencia.anotar('s1', 'super', '203.0.113.60');
    expect(await registro.ipsActivas(new Date(0))).toEqual([]);
  });

  it('cinco fallos desde la misma IP bloquean; desde otra no; y pasada la ventana, tampoco', async () => {
    const r = reloj();
    const seguridad = new RegistroDeSeguridadEnMemoria();
    const ajustes = new AjustesDePlataformaEnMemoria();
    await ajustes.fijarModoPruebas(false, 'suite');
    const intentos = new IntentosDeAcceso(seguridad, new ModoPruebas(ajustes, r.ahora), r.ahora);
    for (let i = 0; i < MAXIMO_DE_FALLOS; i += 1) {
      await intentos.anotarFallo('198.51.100.10', 'portero:1001', 'navegador');
    }
    expect(await intentos.bloqueado('198.51.100.10', 'portero:1001')).toBe(true);
    expect(await intentos.bloqueado('198.51.100.11', 'portero:1001')).toBe(false);
    expect(await intentos.bloqueado(null, 'portero:1001')).toBe(false);
    expect(seguridad.eventos[0]).toMatchObject({ tipo: 'login_fallido', resultado: '401' });
    r.avanzar(VENTANA_DE_BLOQUEO_MS + 1);
    expect(await intentos.bloqueado('198.51.100.10', 'portero:1001')).toBe(false);
  });

  it('con el modo pruebas, los fallos se anotan pero no bloquean', async () => {
    const r = reloj();
    const seguridad = new RegistroDeSeguridadEnMemoria();
    const intentos = new IntentosDeAcceso(
      seguridad,
      new ModoPruebas(new AjustesDePlataformaEnMemoria(), r.ahora),
      r.ahora,
    );
    for (let i = 0; i < MAXIMO_DE_FALLOS + 2; i += 1) {
      await intentos.anotarFallo('198.51.100.10', 'portero:1001', null);
    }
    expect(await intentos.bloqueado('198.51.100.10', 'portero:1001')).toBe(false);
    expect(seguridad.eventos).toHaveLength(MAXIMO_DE_FALLOS + 2);
  });
});
