import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { estadoSegunCodigo } from './estados';
import { TEXTO_MOTIVO } from '@/lib/motivos';
import { NAVEGACION, navegacionDe, rutaInicialDe } from '@/lib/navegacion';

/**
 * Lo que estas pruebas protegen no es la maquetación: son tres reglas que, si
 * se rompen, no dan ningún error visible.
 */
describe('estadoSegunCodigo · el 404 NO se presenta como «sin permiso»', () => {
  it('un 404 dice «no encontrado» y no menciona permisos ni copropiedades', () => {
    // El backend devuelve 404 —y no 403— ante un recurso de otra copropiedad,
    // a propósito: un 403 confirmaría que el identificador existe. Si la
    // consola lo tradujera a «no tienes permiso sobre esto», desharía por
    // texto lo que el backend oculta por código de estado.
    render(estadoSegunCodigo(404, 'da igual'));
    expect(screen.getByText('No encontrado')).toBeDefined();
    expect(screen.queryByText(/permiso/i)).toBeNull();
    expect(screen.queryByText(/copropiedad/i)).toBeNull();
  });

  it('un 403 sí habla de permisos', () => {
    render(estadoSegunCodigo(403, 'da igual'));
    expect(screen.getByText('Sin permiso')).toBeDefined();
  });

  it('un 503 se presenta como falta de conexión, no como error de datos', () => {
    render(estadoSegunCodigo(503, 'da igual'));
    expect(screen.getByText('Sin conexión con el servidor')).toBeDefined();
  });

  it('un 401 lleva a reautenticar, no a reintentar a ciegas', () => {
    render(estadoSegunCodigo(401, 'da igual'));
    expect(screen.getByText('Sesión expirada')).toBeDefined();
  });

  it('un 500 muestra la causa y no un «algo salió mal»', () => {
    render(estadoSegunCodigo(500, 'La consulta excedió el tiempo máximo'));
    expect(screen.getByText(/La consulta excedió el tiempo máximo/)).toBeDefined();
  });
});

describe('motivos de denegación · los diez, sin colapsar', () => {
  it('hay exactamente diez y ninguno queda sin texto', () => {
    const claves = Object.keys(TEXTO_MOTIVO);
    expect(claves).toHaveLength(10);
    expect(Object.values(TEXTO_MOTIVO).every((t) => t.trim().length > 0)).toBe(true);
  });

  it('ninguno comparte texto con otro', () => {
    // Dos motivos con el mismo texto son dos motivos colapsados: el operador
    // ya no puede saber cuál determinó la decisión, que es lo que hace
    // auditable el evento.
    expect(new Set(Object.values(TEXTO_MOTIVO)).size).toBe(10);
  });

  it('distingue explícitamente los tres que el documento separa a propósito', () => {
    // CA-14 (aforo), CA-15 (horario) y CU-05 alterno 2a (zona sin permiso) son
    // criterios distintos; D-18 añadió FUERA_DE_HORARIO justo por esto.
    const textos = [
      TEXTO_MOTIVO.AFORO_SUPERADO,
      TEXTO_MOTIVO.FUERA_DE_HORARIO,
      TEXTO_MOTIVO.ZONA_NO_AUTORIZADA,
    ];
    expect(new Set(textos).size).toBe(3);
  });
});

describe('navegación por rol · la interfaz oculta, no protege', () => {
  it('el portero no ve las pantallas exclusivas de administración', () => {
    const claves = navegacionDe('portero').map((e) => e.clave);
    expect(claves).toContain('tablero');
    expect(claves).not.toContain('configuracion');
    expect(claves).not.toContain('viviendas');
  });

  it('el administrador ve los nueve elementos del mockup', () => {
    expect(navegacionDe('administrador')).toHaveLength(9);
    expect(NAVEGACION).toHaveLength(9);
  });

  it('el residente no tiene consola web: se le dice, no se le deja en blanco', () => {
    expect(navegacionDe('residente')).toHaveLength(0);
    expect(rutaInicialDe('residente')).toBe('/sin-consola');
  });

  it('la identidad de servicio tampoco entra en la consola', () => {
    expect(rutaInicialDe('servicio')).toBe('/sin-consola');
  });

  it('todo elemento declara sus roles: ninguno queda abierto por omisión', () => {
    expect(NAVEGACION.every((e) => e.roles.length > 0)).toBe(true);
  });
});
