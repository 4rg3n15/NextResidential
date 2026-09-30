import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { estadoSegunCodigo } from './estados';
import { CAUSA_BASE_DE_DATOS_NO_DISPONIBLE, ErrorDeApi, desenvolver } from '@/lib/api/cliente';
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

  it('un 502 (la API no responde) se presenta como falta de conexión, no como error de datos', () => {
    render(estadoSegunCodigo(502, 'da igual'));
    expect(screen.getByText('La API no responde')).toBeDefined();
  });

  it('un 503 es la API que CONTESTA «no disponible»: se dice su motivo, no «sin conexión»', () => {
    render(estadoSegunCodigo(503, 'La API está arrancando: vuelva a intentarlo en unos segundos'));
    expect(screen.getByText('Servicio no disponible por ahora')).toBeDefined();
    expect(screen.getByText(/La API está arrancando/)).toBeDefined();
    expect(screen.queryByText('Sin conexión con el servidor')).toBeNull();
  });

  it('sin respuesta alguna (código 0) es falta de conexión', () => {
    render(estadoSegunCodigo(0, 'da igual'));
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
    expect(claves).not.toContain('configuracion');
    expect(claves).not.toContain('viviendas');
  });

  it('el portero aterriza en Portería: el tablero lee indicadores que la API no le da (15-L)', () => {
    expect(navegacionDe('portero').map((e) => e.clave)).not.toContain('tablero');
    expect(rutaInicialDe('portero')).toBe('/porteria');
    expect(rutaInicialDe('administrador')).toBe('/tablero');
  });

  it('el administrador ve las trece entradas, y cada añadido tiene su etapa', () => {
    // Nueve hasta la ETAPA 09; la 10 añade Portería y Guardia virtual, que son
    // DOS superficies y no una (C-12); la 14 añade Latencias, que no está en
    // el mockup porque el mockup no tenía tablero de observabilidad. La 15
    // añadió Rostro del visitante y la 15-L (F) la retira: la foto se toma
    // ahora en «Generar autorización», dentro de Visitantes.
    expect(navegacionDe('administrador')).toHaveLength(13);
    expect(NAVEGACION.map((e) => e.clave)).not.toContain('biometria');
    // La 15-H añade DOS entradas que el administrador NO ve: «Porteros», del
    // superadministrador (B4), y «Mi perfil», del portero (E-02). La 15-I añade
    // «Residentes», también sólo del superadministrador (3.1, D5 a, D6), y
    // «Listas negras» (HU-35), que sí ve el administrador.
    // La 15-M (C3, D-12) añade las OCHO pantallas del residente, que sólo él ve.
    expect(NAVEGACION).toHaveLength(24);
  });

  it('15-I · sólo el superadministrador supervisa residentes', () => {
    expect(navegacionDe('superadministrador').map((e) => e.clave)).toContain('residentes');
    expect(navegacionDe('administrador').map((e) => e.clave)).not.toContain('residentes');
    expect(navegacionDe('residente').map((e) => e.clave)).not.toContain('residentes');
  });

  it('15-H · sólo el superadministrador supervisa porteros; sólo el portero ve su perfil', () => {
    expect(navegacionDe('superadministrador').map((e) => e.clave)).toContain('porteros');
    expect(navegacionDe('administrador').map((e) => e.clave)).not.toContain('porteros');
    expect(navegacionDe('portero').map((e) => e.clave)).toContain('mi-perfil');
    expect(navegacionDe('portero').map((e) => e.clave)).not.toContain('porteros');
  });

  it('el portero NO ve las latencias: no es información de su puesto', () => {
    expect(navegacionDe('portero').map((e) => e.clave)).not.toContain('observabilidad');
    expect(navegacionDe('operador_central').map((e) => e.clave)).toContain('observabilidad');
  });

  it('el portero ve Portería y, desde la 15-L, también la guardia virtual (H4)', () => {
    // Eran dos consolas (C-12). El cliente pidió porteros de guardia REMOTA
    // (H4): la ve, y es la API la que decide en cada petición si su IP está
    // entre las permitidas. La interfaz oculta; no protege.
    const claves = navegacionDe('portero').map((e) => e.clave);
    expect(claves).toContain('porteria');
    expect(claves).toContain('guardia');
  });

  it('el operador de central ve las dos', () => {
    const claves = navegacionDe('operador_central').map((e) => e.clave);
    expect(claves).toContain('porteria');
    expect(claves).toContain('guardia');
  });

  it('15-M (D-12) · el residente tiene su menú de ocho, sólo el suyo, y aterriza en «Mi vivienda»', () => {
    const claves = navegacionDe('residente').map((e) => e.clave);
    expect(claves).toEqual([
      'mi',
      'mi-familia',
      'mi-vehiculos',
      'mi-visitas',
      'mi-zonas',
      'mi-historial',
      'mi-notificaciones',
      'mi-perfil-residente',
    ]);
    expect(rutaInicialDe('residente')).toBe('/mi');
    // Y NINGUNA entrada de administración, portería ni guardia lo lleva.
    for (const e of NAVEGACION.filter((x) => !x.clave.startsWith('mi'))) {
      expect(e.roles, e.clave).not.toContain('residente');
    }
    // Ni el resto ve las suyas.
    for (const rol of [
      'superadministrador',
      'administrador',
      'portero',
      'operador_central',
    ] as const) {
      expect(
        navegacionDe(rol)
          .map((e) => e.clave)
          .filter((c) => c.startsWith('mi-') || c === 'mi'),
      ).toEqual(rol === 'portero' ? ['mi-perfil'] : []);
    }
  });

  it('la identidad de servicio tampoco entra en la consola', () => {
    expect(rutaInicialDe('servicio')).toBe('/sin-consola');
  });

  it('todo elemento declara sus roles: ninguno queda abierto por omisión', () => {
    expect(NAVEGACION.every((e) => e.roles.length > 0)).toBe(true);
  });
});

describe('15-O · un 503 por la base se nombra: no es «la API caída»', () => {
  // El cuerpo exacto que responde el filtro global de la API ante un corte.
  const cuerpo = {
    estado: 503,
    correlacion: 'c-1',
    mensaje: {
      codigo: CAUSA_BASE_DE_DATOS_NO_DISPONIBLE,
      message:
        'Base de datos no disponible por ahora: se perdió la conexión con PostgreSQL. La API sigue en marcha; reintente en unos segundos.',
    },
  };
  const errorDeLaApi = (): ErrorDeApi => {
    try {
      desenvolver({ error: cuerpo, response: new Response(null, { status: 503 }) });
    } catch (e) {
      if (e instanceof ErrorDeApi) return e;
    }
    throw new Error('desenvolver no lanzó ErrorDeApi');
  };

  it('desenvolver conserva la causa del cuerpo', () => {
    const e = errorDeLaApi();
    expect(e.estado).toBe(503);
    expect(e.causa).toBe(CAUSA_BASE_DE_DATOS_NO_DISPONIBLE);
  });

  it('la pantalla dice «Base de datos no disponible», aunque su descripción propia sea otra', () => {
    render(estadoSegunCodigo(errorDeLaApi(), 'No se pudo cargar la portería.'));
    expect(screen.getByText('Base de datos no disponible')).toBeDefined();
    expect(screen.getByText(/La API sigue en marcha/)).toBeDefined();
    expect(screen.queryByText('La API no responde')).toBeNull();
    expect(screen.queryByText('Servicio no disponible por ahora')).toBeNull();
  });

  it('otro 503 de la API sigue diciendo su motivo', () => {
    render(
      estadoSegunCodigo(new ErrorDeApi(503, 'La API está arrancando'), 'La API está arrancando'),
    );
    expect(screen.getByText('Servicio no disponible por ahora')).toBeDefined();
  });
});
