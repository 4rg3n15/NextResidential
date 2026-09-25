import { beforeEach, describe, expect, it } from 'vitest';
import { ConsentimientoBiometrico } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { FirmanteHmacDeEnlaces } from '../infraestructura/firmante-de-enlaces';
import { RepositorioConsentimientosEnMemoria } from '../infraestructura/repositorios-en-memoria';
import {
  EmitirEnlaceDeConsentimiento,
  ResolverEnlaceDeConsentimiento,
} from './enlace-de-consentimiento';

const COP = '10000000-0000-4000-8000-000000000001';
const TITULAR = '40000000-0000-4000-8000-000000000103';
const CONSENTIMIENTO = '50000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-09-25T10:00:00.000Z');
const HORA = 3_600_000;

class RelojMovil implements Reloj {
  constructor(public instante: Date) {}
  ahora(): Date {
    return this.instante;
  }
}
const ctx: ContextoTenant = {
  usuarioId: 'portero-1',
  rol: 'portero',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: false,
};

let consentimientos: RepositorioConsentimientosEnMemoria;
let reloj: RelojMovil;
let firmante: FirmanteHmacDeEnlaces;

const declarar = (estado: 'pendiente' | 'vigente' | 'rechazado' | 'revocado' | 'expirado') => {
  const c = ConsentimientoBiometrico.solicitar({
    id: CONSENTIMIENTO,
    copropiedadId: COP,
    titularId: TITULAR,
    finalidad: 'control_acceso',
    versionPolitica: 'v1',
    canal: 'sms',
    solicitadoEn: AHORA,
    estado,
    ...(estado === 'vigente' ? { otorgadoEn: AHORA } : {}),
    ...(estado === 'revocado' || estado === 'rechazado' || estado === 'expirado'
      ? { revocadoEn: AHORA }
      : {}),
  });
  if (!c.ok) throw new Error(c.error.detalle);
  consentimientos.declarar(c.valor);
};

const emisor = (urlPublica: string | null = 'http://192.0.2.10:3000/') =>
  new EmitirEnlaceDeConsentimiento(consentimientos, firmante, reloj, {
    plazoHoras: 24,
    urlPublica,
  });

beforeEach(() => {
  consentimientos = new RepositorioConsentimientosEnMemoria();
  reloj = new RelojMovil(AHORA);
  firmante = new FirmanteHmacDeEnlaces('llave-de-biometria-solo-para-pruebas-32+');
});

describe('EmitirEnlaceDeConsentimiento (A3)', () => {
  it('emite URL completa con el origen público, sin barra duplicada, y caduca al plazo', async () => {
    declarar('pendiente');
    const r = await emisor().ejecutar(ctx, { consentimientoId: CONSENTIMIENTO });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.url).toBe(`http://192.0.2.10:3000${r.valor.ruta}`);
    expect(r.valor.ruta).toMatch(/^\/consentimiento\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(r.valor.expiraEn).toEqual(new Date(AHORA.getTime() + 24 * HORA));
    expect(r.valor.estado).toBe('pendiente');
  });

  it('sin origen público entrega la ruta y url nula: no inventa un host', async () => {
    declarar('pendiente');
    const r = await emisor(null).ejecutar(ctx, { consentimientoId: CONSENTIMIENTO });
    expect(r.ok && r.valor.url).toBeNull();
    expect(r.ok && r.valor.ruta.startsWith('/consentimiento/')).toBe(true);
  });

  it('un consentimiento vigente también admite enlace: es el de la revocación', async () => {
    declarar('vigente');
    const r = await emisor().ejecutar(ctx, { consentimientoId: CONSENTIMIENTO });
    expect(r.ok && r.valor.estado).toBe('vigente');
  });

  it.each(['rechazado', 'revocado', 'expirado'] as const)(
    'un consentimiento %s ya no admite enlace',
    async (estado) => {
      declarar(estado);
      const r = await emisor().ejecutar(ctx, { consentimientoId: CONSENTIMIENTO });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
    },
  );

  it('un consentimiento inexistente no produce enlace', async () => {
    const r = await emisor().ejecutar(ctx, { consentimientoId: CONSENTIMIENTO });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
  });

  it('sin copropiedad en el contexto no hay enlace', async () => {
    declarar('pendiente');
    const r = await emisor().ejecutar(
      { ...ctx, copropiedadId: null },
      { consentimientoId: CONSENTIMIENTO },
    );
    expect(r.ok).toBe(false);
  });
});

describe('ResolverEnlaceDeConsentimiento', () => {
  it('un enlace válido resuelve al consentimiento y a su titular', async () => {
    declarar('pendiente');
    const e = await emisor().ejecutar(ctx, { consentimientoId: CONSENTIMIENTO });
    if (!e.ok) throw new Error('debía emitirse');
    const r = await new ResolverEnlaceDeConsentimiento(consentimientos, firmante, reloj).ejecutar(
      e.valor.token,
    );
    expect(r?.datos.titularId).toBe(TITULAR);
    expect(r?.consentimiento.id).toBe(CONSENTIMIENTO);
  });

  it('caducado, no resuelve', async () => {
    declarar('pendiente');
    const e = await emisor().ejecutar(ctx, { consentimientoId: CONSENTIMIENTO });
    if (!e.ok) throw new Error('debía emitirse');
    reloj.instante = new Date(AHORA.getTime() + 25 * HORA);
    const r = await new ResolverEnlaceDeConsentimiento(consentimientos, firmante, reloj).ejecutar(
      e.valor.token,
    );
    expect(r).toBeNull();
  });

  it('si el consentimiento cambió de titular en la base, el enlace deja de valer', async () => {
    declarar('pendiente');
    const e = await emisor().ejecutar(ctx, { consentimientoId: CONSENTIMIENTO });
    if (!e.ok) throw new Error('debía emitirse');
    // Se reemplaza la fila por una del MISMO id con otro titular: el enlace
    // firmado nombra al anterior y no debe abrir la de otro.
    const otro = ConsentimientoBiometrico.solicitar({
      id: CONSENTIMIENTO,
      copropiedadId: COP,
      titularId: '40000000-0000-4000-8000-000000000999',
      finalidad: 'control_acceso',
      versionPolitica: 'v1',
      canal: 'sms',
      solicitadoEn: AHORA,
    });
    if (!otro.ok) throw new Error(otro.error.detalle);
    consentimientos.declarar(otro.valor);
    const r = await new ResolverEnlaceDeConsentimiento(consentimientos, firmante, reloj).ejecutar(
      e.valor.token,
    );
    expect(r).toBeNull();
  });
});
