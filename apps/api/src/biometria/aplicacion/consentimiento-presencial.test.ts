import { beforeEach, describe, expect, it } from 'vitest';
import { esExito, esFallo } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AuditoriaEnMemoria } from '../../comun/auditoria';
import { IdentidadDePersonaEnMemoria } from '../../padron';
import { AlmacenEnMemoria, BovedaAesGcm } from '../infraestructura/boveda-cifrada';
import {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from '../infraestructura/repositorios-en-memoria';
import { CapturarRostro, ResponderConsentimiento } from './casos-de-uso';
import { AceptarConsentimientoPresencial } from './consentimiento-presencial';

/**
 * D-10 · el titular acepta en la portería escribiendo su identidad. Lo que se
 * prueba es lo que lo separa de «el operador marca una casilla».
 */
const COP = 'cop-1';
const TITULAR = 'visitante-1';
const AHORA = new Date('2026-09-26T15:00:00.000Z');
const LLAVE = 'llave-de-prueba-de-treinta-y-dos-caracteres';
const IDENTIDAD = { nombreCompleto: 'Lucía Fernández Ruiz', numeroDocumento: '52123456' };

const reloj: Reloj = { ahora: () => AHORA };
let n = 0;
const ids: GeneradorDeId = { nuevo: () => `id-${String((n += 1))}` };

const portero: ContextoTenant = {
  usuarioId: 'portero-1',
  rol: 'portero',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: true,
};

let consentimientos: RepositorioConsentimientosEnMemoria;
let plantillas: RepositorioPlantillasEnMemoria;
let auditoria: AuditoriaEnMemoria;
let avisos: string[];
let presencial: AceptarConsentimientoPresencial;
let consentimientoId: string;
let plantillaId: string;

beforeEach(async () => {
  consentimientos = new RepositorioConsentimientosEnMemoria();
  plantillas = new RepositorioPlantillasEnMemoria();
  auditoria = new AuditoriaEnMemoria();
  avisos = [];
  const bitacora: Bitacora = {
    registrar: (nivel, mensaje, contexto) => {
      if (nivel === 'aviso') avisos.push(`${mensaje} ${JSON.stringify(contexto ?? {})}`);
    },
  };
  const identidades = new IdentidadDePersonaEnMemoria();
  identidades.declarar(COP, TITULAR, IDENTIDAD);
  const boveda = new BovedaAesGcm(LLAVE, 'env:BIOMETRIA_LLAVE', new AlmacenEnMemoria(), {
    sincronizar: async () => undefined,
    suprimir: async () => undefined,
  });
  const captura = await new CapturarRostro(
    consentimientos,
    plantillas,
    boveda,
    reloj,
    ids,
  ).ejecutar(portero, {
    titularId: TITULAR,
    medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
    vector: new Uint8Array([1, 2, 3, 4]),
    versionPolitica: 'v2',
    canal: 'presencial',
    suprimirEn: new Date(AHORA.getTime() + 8 * 3_600_000),
  });
  if (!esExito(captura) || !captura.valor.aceptada) throw new Error('captura inválida');
  consentimientoId = captura.valor.consentimientoId;
  plantillaId = captura.valor.plantillaId;
  presencial = new AceptarConsentimientoPresencial(
    consentimientos,
    identidades,
    new ResponderConsentimiento(consentimientos, plantillas, reloj),
    auditoria,
    bitacora,
  );
});

const aceptar = (identidad = IDENTIDAD, versionPoliticaAceptada = 'v2') =>
  presencial.ejecutar(portero, {
    consentimientoId,
    identidad,
    versionPoliticaAceptada,
    origen: { ip: '203.0.113.9', userAgent: 'consola' },
  });

describe('D-10 · aceptación presencial por el titular', () => {
  it('con SU nombre y SU documento queda vigente y la plantilla puede viajar', async () => {
    const r = await aceptar({
      nombreCompleto: 'LUCIA FERNANDEZ RUIZ',
      numeroDocumento: '52.123.456',
    });
    expect(esExito(r) && r.valor.estado).toBe('vigente');
    expect((await consentimientos.porId(COP, consentimientoId))?.estado).toBe('vigente');
    const [p] = await plantillas.deConsentimiento(COP, consentimientoId);
    expect(p?.id).toBe(plantillaId);
    expect(p?.estado).toBe('pendiente_sincronizacion');
  });

  it('deja en la auditoría canal presencial, operador, versión de la política', async () => {
    await aceptar();
    expect(auditoria.respuestasDeTitular).toEqual([
      expect.objectContaining({
        consentimientoId,
        respuesta: 'aceptado',
        versionPolitica: 'v2',
        canal: 'presencial',
        operadorId: 'portero-1',
      }),
    ]);
  });

  it('otro documento NO acepta, no dice cuál falló y no deja los datos en la bitácora', async () => {
    const r = await aceptar({ ...IDENTIDAD, numeroDocumento: '52123457' });
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) {
      expect(r.error.regla).toBe('RN-10');
      expect(r.error.detalle).not.toContain('52123456');
      expect(r.error.detalle).not.toContain('Lucía');
    }
    expect((await consentimientos.porId(COP, consentimientoId))?.estado).toBe('pendiente');
    expect(auditoria.respuestasDeTitular).toHaveLength(0);
    expect(avisos.join()).not.toMatch(/5212345|Lucía/);
  });

  it('otro nombre tampoco', async () => {
    const r = await aceptar({ ...IDENTIDAD, nombreCompleto: 'Pedro Fernández Ruiz' });
    expect(esFallo(r)).toBe(true);
  });

  it('si aceptó OTRA versión de la política, no se acepta', async () => {
    const r = await aceptar(IDENTIDAD, 'v1');
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.detalle).toMatch(/v1.*v2/);
  });

  it('un consentimiento ya respondido no se reabre en la portería', async () => {
    expect(esExito(await aceptar())).toBe(true);
    const otra = await aceptar();
    expect(esFallo(otra)).toBe(true);
    if (esFallo(otra)) expect(otra.error.detalle).toMatch(/vigente/);
  });

  it('un titular que no está en el padrón no se acepta', async () => {
    const vacio = new AceptarConsentimientoPresencial(
      consentimientos,
      new IdentidadDePersonaEnMemoria(),
      new ResponderConsentimiento(consentimientos, plantillas, reloj),
      auditoria,
      { registrar: () => undefined },
    );
    const r = await vacio.ejecutar(portero, {
      consentimientoId,
      identidad: IDENTIDAD,
      versionPoliticaAceptada: 'v2',
      origen: { ip: null, userAgent: null },
    });
    expect(esFallo(r)).toBe(true);
  });
});
