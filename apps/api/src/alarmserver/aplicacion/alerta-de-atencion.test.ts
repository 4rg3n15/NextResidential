import { describe, expect, it } from 'vitest';
import { alertaDeAtencionDeEquipo } from './alerta-de-atencion';

const COP = 'cop-1';
const ev = (tipo: string, enVivo = true) => ({
  dispositivoId: 'disp-portero',
  tipo,
  titulo: `Título de ${tipo}`,
  enVivo,
});

/** G2 (15-N) · una alerta por disparador que emite el equipo; la clave es el disparador. */
describe('alertaDeAtencionDeEquipo', () => {
  it('la llamada abre una alerta alta con clave «llamada»', () => {
    expect(alertaDeAtencionDeEquipo(ev('llamada'), COP)).toEqual({
      copropiedadId: COP,
      dispositivoId: 'disp-portero',
      clave: 'llamada',
      notas: 'Título de llamada',
      persistente: false,
      tipo: 'acceso_dudoso',
      severidad: 'alta',
    });
  });

  it('el rostro no reconocido abre una media con clave «rostro»', () => {
    const a = alertaDeAtencionDeEquipo(ev('rostro_no_reconocido'), COP);
    expect(a).toMatchObject({ tipo: 'acceso_dudoso', severidad: 'media', clave: 'rostro' });
  });

  it('la lista negra del equipo es crítica', () => {
    expect(alertaDeAtencionDeEquipo(ev('lista_negra'), COP)).toMatchObject({
      tipo: 'lista_negra',
      severidad: 'critica',
    });
  });

  it('el histórico y lo que no dispara no abren nada', () => {
    expect(alertaDeAtencionDeEquipo(ev('llamada', false), COP)).toBeNull();
    expect(alertaDeAtencionDeEquipo(ev('puerta_abierta'), COP)).toBeNull();
  });
});
