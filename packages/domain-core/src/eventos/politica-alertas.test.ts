import { describe, expect, it } from 'vitest';
import { alertaDeDispositivoCaido, clasificarAcceso } from './politica-alertas';
import { Acceso } from './acceso';
import type { HechoDeAcceso } from './acceso';
import { VersionDeReglas } from '../autorizaciones/version-de-reglas';
import { negar, permitir } from '../reglas/resultado-acceso';
import type { ResultadoAcceso } from '../reglas/resultado-acceso';
import { esExito } from '../compartido/resultado';
import type { Resultado } from '../compartido/resultado';
import type { ErrorDominio, MotivoAcceso } from '../compartido/errores';
import { MOTIVOS_ACCESO } from '../compartido/errores';
import type { MetodoDeAcceso } from '../reglas/contexto';

const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};
const VERSION = abrir(VersionDeReglas.crear(3, 'cop-1'));

const acceso = (decision: ResultadoAcceso, extra: Partial<HechoDeAcceso> = {}): Acceso =>
  abrir(
    Acceso.desdeDecision(
      {
        id: 'evt-1',
        copropiedadId: 'cop-1',
        ocurridoEn: new Date('2026-09-08T14:00:00Z'),
        tipo: decision.permitido ? 'ingreso' : 'denegado',
        metodo: 'placa',
        dispositivoId: 'disp-1',
        claveIdempotencia: 'cop-1:disp-1:placa:ref',
        ...extra,
      },
      decision,
    ),
  );

const negado = (motivo: MotivoAcceso, metodo: MetodoDeAcceso = 'placa'): Acceso =>
  acceso(negar(motivo, VERSION, 'regla'), { metodo });

describe('clasificarAcceso · RN-06 tiene precedencia también en las alertas', () => {
  it('un vetado en la puerta es crítico', () => {
    const d = clasificarAcceso(negado('LISTA_NEGRA'));
    expect(d).toEqual({
      tipo: 'lista_negra',
      severidad: 'critica',
      porQue: expect.stringContaining('lista negra'),
    });
  });
});

describe('clasificarAcceso · P-07, «acceso dudoso» escala en vez de decidir', () => {
  it('un permiso con lectura sin confirmar levanta alerta ALTA (CU-01 3a)', () => {
    const d = clasificarAcceso(acceso(permitir(VERSION, 'motor.ninguna', true)));
    expect(d?.tipo).toBe('acceso_dudoso');
    // Alta y no media: la puerta YA se abrió con una lectura que nadie
    // confirmó. Es más urgente que una negación dudosa, donde no pasó nadie.
    expect(d?.severidad).toBe('alta');
  });

  it('una confianza insuficiente levanta alerta media', () => {
    const d = clasificarAcceso(negado('CONFIANZA_INSUFICIENTE'));
    expect(d?.tipo).toBe('acceso_dudoso');
    expect(d?.severidad).toBe('media');
  });

  it('una placa desconocida leída por LPR es dudosa', () => {
    expect(clasificarAcceso(negado('PLACA_DESCONOCIDA', 'placa'))?.tipo).toBe('acceso_dudoso');
  });

  it('la misma negación por otro método NO lo es', () => {
    // `PLACA_DESCONOCIDA` con método facial es un contexto mal armado, no un
    // vehículo sin registrar en la puerta; alertar aquí sería ruido.
    expect(clasificarAcceso(negado('PLACA_DESCONOCIDA', 'facial'))).toBeNull();
  });

  it('un fallo técnico se escala aunque ya se haya denegado por defecto', () => {
    expect(clasificarAcceso(negado('FALLO_TECNICO'))?.tipo).toBe('acceso_dudoso');
  });

  it('un permiso normal no genera alerta', () => {
    expect(clasificarAcceso(acceso(permitir(VERSION, 'motor.ninguna')))).toBeNull();
  });
});

describe('clasificarAcceso · lo que NO alerta, para que las alertas sigan sirviendo', () => {
  const SILENCIOSOS: MotivoAcceso[] = [
    'VIGENCIA_EXPIRADA',
    'AFORO_SUPERADO',
    'ZONA_NO_AUTORIZADA',
    'FUERA_DE_PATRON',
    'FUERA_DE_HORARIO',
    'SIN_CONSENTIMIENTO',
  ];

  it.each(SILENCIOSOS)('%s se registra pero no escala', (motivo) => {
    expect(clasificarAcceso(negado(motivo))).toBeNull();
  });

  it('los diez motivos están repartidos entre los que alertan y los que no', () => {
    // Cierra el hueco de que un motivo nuevo quede sin criterio: si mañana se
    // añade el undécimo, esta cuenta deja de cuadrar y hay que decidir.
    const alertan = MOTIVOS_ACCESO.filter((m) => clasificarAcceso(negado(m)) !== null);
    expect(alertan.sort()).toEqual(
      ['CONFIANZA_INSUFICIENTE', 'FALLO_TECNICO', 'LISTA_NEGRA', 'PLACA_DESCONOCIDA'].sort(),
    );
    expect(alertan.length + SILENCIOSOS.length).toBe(MOTIVOS_ACCESO.length);
  });
});

describe('alertaDeDispositivoCaido', () => {
  it('es alta y nombra al dispositivo', () => {
    const d = alertaDeDispositivoCaido('disp-7');
    expect(d.tipo).toBe('dispositivo_caido');
    expect(d.severidad).toBe('alta');
    expect(d.porQue).toContain('disp-7');
  });
});
