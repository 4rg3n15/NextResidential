import { describe, expect, it, vi } from 'vitest';
import { esFallo } from '@ncr/domain-core';
import {
  BuscarPersonas,
  DesactivarVehiculo,
  DesactivarVivienda,
  ListarVehiculos,
  ListarViviendas,
  RegistrarPersona,
  RegistrarResidente,
  RegistrarVehiculo,
  RegistrarVivienda,
} from './casos-de-uso';
import type { RepositorioPadron } from './puertos';
import type { LectorDeVocabulario } from './vocabulario';
import type { ContextoTenant } from '../../autenticacion';

const ctx: ContextoTenant = {
  usuarioId: 'u1',
  rol: 'administrador',
  copropiedadId: 'cop-1',
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};
/** Identidad de plataforma: superadministrador sin copropiedad propia. */
const sinTenant: ContextoTenant = { ...ctx, rol: 'superadministrador', copropiedadId: null };

/**
 * Vocabulario del conjunto. Por defecto, **sin configurar**: es el estado de una
 * copropiedad recién creada por el guion de aprovisionamiento, y el que más se
 * ejercita en producción el primer día.
 */
const vocabulario = (
  etiquetaVivienda = 'Vivienda',
  etiquetaAgrupacion = 'Torre o bloque',
): LectorDeVocabulario => ({
  leer: vi.fn().mockResolvedValue({ tipo: null, etiquetaVivienda, etiquetaAgrupacion }),
});

const repo = (parcial: Partial<RepositorioPadron> = {}): RepositorioPadron => {
  const base: RepositorioPadron = {
    resolverPlaca: vi.fn().mockResolvedValue(null),
    editarVivienda: vi.fn().mockResolvedValue({ tipo: 'editada' }),
    editarVehiculo: vi.fn().mockResolvedValue({ tipo: 'editado' }),
    historialDeVehiculo: vi.fn().mockResolvedValue(null),
    borrarVehiculoDefinitivamente: vi.fn().mockResolvedValue({ borrado: true }),
    registrarVehiculo: vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v1' }),
    desactivarVehiculo: vi.fn().mockResolvedValue(true),
    registrarResidente: vi.fn().mockResolvedValue({ id: 'r1' }),
    desactivarVivienda: vi.fn().mockResolvedValue(true),
    contarVehiculosActivos: vi.fn().mockResolvedValue(0),
    registrarVivienda: vi.fn().mockResolvedValue({ tipo: 'registrada', id: 'viv-9' }),
    buscarPersonas: vi.fn().mockResolvedValue([]),
    registrarPersona: vi
      .fn()
      .mockResolvedValue({ tipo: 'registrada', id: 'per-1', nombreCompleto: 'Ana Pérez' }),
    listarViviendas: vi
      .fn()
      .mockResolvedValue({ totales: { activas: 2, inactivas: 1 }, viviendas: [] }),
    listarVehiculos: vi.fn().mockResolvedValue([]),
    buscarViviendaPorIdentificador: vi.fn().mockResolvedValue(null),
    generarViviendas: vi.fn().mockResolvedValue({ creadas: 0, colisiones: [] }),
    viviendasExistentes: vi.fn().mockResolvedValue([]),
    exportarPadron: vi.fn().mockResolvedValue([]),
    enTransaccion: async (op) => op(base),
    ...parcial,
  };
  return base;
};

describe('RegistrarVehiculo', () => {
  it('normaliza la placa ANTES de llegar al repositorio', async () => {
    const registrar = vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v9' });
    const r = await new RegistrarVehiculo(repo({ registrarVehiculo: registrar })).ejecutar(ctx, {
      viviendaId: 'viv-1',
      placa: ' abc-123 ',
    });
    expect(r.ok && r.valor.id).toBe('v9');
    // Si la normalización ocurriera después, el índice único compararía formas
    // distintas del mismo dato y RN-04 dejaría de sostenerse.
    expect(registrar.mock.calls[0]![0].placa.valor).toBe('ABC123');
  });

  it('rechaza una placa inválida sin tocar el repositorio', async () => {
    const registrar = vi.fn();
    const r = await new RegistrarVehiculo(repo({ registrarVehiculo: registrar })).ejecutar(ctx, {
      viviendaId: 'viv-1',
      placa: 'AB',
    });
    expect(esFallo(r)).toBe(true);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('traduce el choque del índice único a CONFLICTO_DE_CONCURRENCIA (ADR-04)', async () => {
    const r = await new RegistrarVehiculo(
      repo({ registrarVehiculo: vi.fn().mockResolvedValue({ tipo: 'placa_activa_duplicada' }) }),
    ).ejecutar(ctx, { viviendaId: 'viv-1', placa: 'ABC123' });
    expect(esFallo(r) && r.error.codigo).toBe('CONFLICTO_DE_CONCURRENCIA');
    expect(esFallo(r) && r.error.regla).toBe('RN-04');
  });

  it('una identidad sin copropiedad no puede registrar (RN-15)', async () => {
    const r = await new RegistrarVehiculo(repo()).ejecutar(sinTenant, {
      viviendaId: 'v',
      placa: 'ABC123',
    });
    expect(esFallo(r) && r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
  });

  it('propaga los campos opcionales tal cual, con null cuando faltan', async () => {
    const registrar = vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v1' });
    await new RegistrarVehiculo(repo({ registrarVehiculo: registrar })).ejecutar(ctx, {
      viviendaId: 'viv-1',
      placa: 'ABC123',
      marca: 'Mazda',
    });
    const alta = registrar.mock.calls[0]![0];
    expect(alta).toMatchObject({ marca: 'Mazda', modelo: null, color: null, personaId: null });
  });
});

describe('DesactivarVehiculo · RN-19', () => {
  it('exige motivo no vacío', async () => {
    const desactivar = vi.fn();
    for (const motivo of ['', '   ']) {
      const r = await new DesactivarVehiculo(repo({ desactivarVehiculo: desactivar })).ejecutar(
        ctx,
        'x1',
        motivo,
      );
      expect(esFallo(r) && r.error.regla).toBe('RN-19');
    }
    expect(desactivar).not.toHaveBeenCalled();
  });

  it('devuelve ENTIDAD_NO_ENCONTRADA si no había vehículo activo', async () => {
    const r = await new DesactivarVehiculo(
      repo({ desactivarVehiculo: vi.fn().mockResolvedValue(false) }),
    ).ejecutar(ctx, 'x1', 'vendido');
    expect(esFallo(r) && r.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
  });

  it('éxito cuando la baja se aplica', async () => {
    const r = await new DesactivarVehiculo(repo()).ejecutar(ctx, 'x1', 'vendido');
    expect(r.ok).toBe(true);
  });

  it('sin copropiedad en el contexto, no procede', async () => {
    const r = await new DesactivarVehiculo(repo()).ejecutar(sinTenant, 'x1', 'vendido');
    expect(esFallo(r) && r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
  });
});

describe('DesactivarVivienda · RN-19', () => {
  it('exige motivo, encuentra o no la vivienda, y respeta el tenant', async () => {
    const sinMotivo = await new DesactivarVivienda(repo()).ejecutar(ctx, 'viv-1', ' ');
    expect(esFallo(sinMotivo) && sinMotivo.error.regla).toBe('RN-19');

    const inexistente = await new DesactivarVivienda(
      repo({ desactivarVivienda: vi.fn().mockResolvedValue(false) }),
    ).ejecutar(ctx, 'viv-1', 'demolida');
    expect(esFallo(inexistente) && inexistente.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');

    expect((await new DesactivarVivienda(repo()).ejecutar(ctx, 'viv-1', 'demolida')).ok).toBe(true);

    const sinCop = await new DesactivarVivienda(repo()).ejecutar(sinTenant, 'viv-1', 'demolida');
    expect(esFallo(sinCop) && sinCop.error.codigo).toBe('OPERACION_NO_PERMITIDA');
  });
});

describe('RegistrarVivienda', () => {
  it('recorta el identificador y lo pasa limpio al repositorio', async () => {
    const registrar = vi.fn().mockResolvedValue({ tipo: 'registrada', id: 'viv-7' });
    const r = await new RegistrarVivienda(
      repo({ registrarVivienda: registrar }),
      vocabulario(),
    ).ejecutar(ctx, { identificador: '  42  ', agrupacion: '  B  ' });
    expect(r.ok && r.valor.id).toBe('viv-7');
    expect(registrar.mock.calls[0]![0].identificador).toBe('42');
    expect(registrar.mock.calls[0]![0].agrupacion).toBe('B');
  });

  it('normaliza a NFC el identificador y la agrupación (H-13-16)', async () => {
    // El índice único parcial compara BYTES. Sin NFC, «Mañana» con la ñ
    // precompuesta y «Mañana» con n + combinante son DOS viviendas para
    // PostgreSQL y UNA sola para el portero — medido: dos filas activas que el
    // usuario ve idénticas. Es el argumento que `persona.ts` ya escribía para
    // el documento, aplicado donde faltaba.
    const registrar = vi.fn().mockResolvedValue({ tipo: 'registrada', id: 'viv-7' });
    await new RegistrarVivienda(repo({ registrarVivienda: registrar }), vocabulario()).ejecutar(
      ctx,
      { identificador: 'Man\u0303ana', agrupacion: 'Torre N\u0303' },
    );
    expect(registrar.mock.calls[0]![0].identificador).toBe('Mañana'.normalize('NFC'));
    expect(registrar.mock.calls[0]![0].agrupacion).toBe('Torre Ñ'.normalize('NFC'));
  });

  it('una agrupación vacía llega como NULL, no como cadena vacía', async () => {
    // Importa: el índice único usa `coalesce(agrupacion,'')`, así que '' y NULL
    // son la misma clave. Pero guardar '' dejaría la columna llena de cadenas
    // vacías que ninguna pantalla sabe distinguir de «sin agrupación».
    const registrar = vi.fn().mockResolvedValue({ tipo: 'registrada', id: 'viv-7' });
    await new RegistrarVivienda(repo({ registrarVivienda: registrar }), vocabulario()).ejecutar(
      ctx,
      { identificador: '42', agrupacion: '   ' },
    );
    expect(registrar.mock.calls[0]![0].agrupacion).toBeNull();
  });

  it('H-3 · «Casa 42» se RECHAZA cuando la copropiedad se llama así a sí misma', async () => {
    // Sin este control, el primero que teclee la palabra reintroduce lo que el
    // rediseño elimina: el día que el conjunto pase de «Casa» a «Apartamento»,
    // esa vivienda se queda mintiendo y la base no puede verlo.
    const registrar = vi.fn();
    const r = await new RegistrarVivienda(
      repo({ registrarVivienda: registrar }),
      vocabulario('Casa'),
    ).ejecutar(ctx, { identificador: 'Casa 42' });
    expect(esFallo(r)).toBe(true);
    expect(esFallo(r) && r.error.detalle).toMatch(/Escriba solo el número/);
    // Y el mensaje dice cuál sería el correcto, que es lo que lo hace una
    // instrucción y no un reproche.
    expect(esFallo(r) && r.error.detalle).toMatch(/«42»/);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('la misma palabra NO se rechaza si el conjunto se llama de otra manera', async () => {
    const registrar = vi.fn().mockResolvedValue({ tipo: 'registrada', id: 'viv-7' });
    const r = await new RegistrarVivienda(
      repo({ registrarVivienda: registrar }),
      vocabulario('Apartamento'),
    ).ejecutar(ctx, { identificador: 'Casa 42' });
    expect(r.ok).toBe(true);
  });

  it('un identificador vacío se rechaza aquí y no llega a la base', async () => {
    const registrar = vi.fn();
    const r = await new RegistrarVivienda(
      repo({ registrarVivienda: registrar }),
      vocabulario(),
    ).ejecutar(ctx, { identificador: '   ' });
    expect(esFallo(r)).toBe(true);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('el choque de identificador lo decide la BASE, y se traduce a conflicto', async () => {
    // No hay `SELECT` previo: quien decide es el índice único parcial (ADR-04),
    // y por eso este caso de uso solo traduce el discriminador que recibe.
    const r = await new RegistrarVivienda(
      repo({ registrarVivienda: vi.fn().mockResolvedValue({ tipo: 'identificador_duplicado' }) }),
      vocabulario(),
    ).ejecutar(ctx, { identificador: '12' });
    expect(esFallo(r) && r.error.codigo).toBe('CONFLICTO_DE_CONCURRENCIA');
  });

  it('una identidad sin copropiedad no crea nada (RN-15)', async () => {
    const registrar = vi.fn();
    const r = await new RegistrarVivienda(
      repo({ registrarVivienda: registrar }),
      vocabulario(),
    ).ejecutar(sinTenant, { identificador: '12' });
    expect(esFallo(r)).toBe(true);
    expect(registrar).not.toHaveBeenCalled();
  });
});

describe('RegistrarResidente', () => {
  it('vincula la persona a la vivienda con el actor de la sesión', async () => {
    const registrar = vi.fn().mockResolvedValue({ id: 'res-1' });
    const r = await new RegistrarResidente(repo({ registrarResidente: registrar })).ejecutar(ctx, {
      viviendaId: 'viv-1',
      personaId: 'per-1',
    });
    expect(r.ok && r.valor.id).toBe('res-1');
    expect(registrar.mock.calls[0]![0].actorId).toBe('u1');
    // La copropiedad sale del CONTEXTO y nunca de la entrada.
    expect(registrar.mock.calls[0]![0].copropiedadId).toBe('cop-1');
  });

  it('un duplicado se traduce a conflicto, no a un `null` silencioso', async () => {
    const r = await new RegistrarResidente(
      repo({ registrarResidente: vi.fn().mockResolvedValue(null) }),
    ).ejecutar(ctx, { viviendaId: 'viv-1', personaId: 'per-1' });
    expect(esFallo(r) && r.error.codigo).toBe('CONFLICTO_DE_CONCURRENCIA');
  });
});

describe('las lecturas del padrón', () => {
  it('los totales viajan tal cual, sin recalcularse en la aplicación', async () => {
    const r = await new ListarViviendas(repo()).ejecutar('cop-1', {});
    expect(r.ok && r.valor.totales).toEqual({ activas: 2, inactivas: 1 });
  });

  it('el filtro llega ENTERO al repositorio: quien filtra es la consulta SQL', async () => {
    const listar = vi
      .fn()
      .mockResolvedValue({ totales: { activas: 0, inactivas: 0 }, viviendas: [] });
    await new ListarViviendas(repo({ listarViviendas: listar })).ejecutar('cop-1', {
      estado: 'inactivo',
      busqueda: 'Casa',
    });
    expect(listar.mock.calls[0]![1]).toEqual({ estado: 'inactivo', busqueda: 'Casa' });
  });

  it('la lista de vehículos se devuelve sin transformar', async () => {
    const r = await new ListarVehiculos(repo()).ejecutar('cop-1');
    expect(r.ok && r.valor).toEqual([]);
  });
});

describe('BuscarPersonas', () => {
  it('normaliza el documento ANTES de consultar: 12.345.678 encuentra a 12345678', async () => {
    const buscar = vi.fn().mockResolvedValue([]);
    await new BuscarPersonas(repo({ buscarPersonas: buscar })).ejecutar('cop-1', '12.345.678');
    // El adaptador recibe el texto tal cual Y su forma normalizada; si la
    // normalización viviera en el SQL, la búsqueda y la escritura se separarían.
    expect(buscar.mock.calls[0]!.slice(1, 3)).toEqual(['12.345.678', '12345678']);
  });

  it('un nombre con espacios o tildes no produce forma de documento', async () => {
    // «Ana Pérez» no puede ser un documento —tiene espacio y tilde—, así que la
    // rama por documento queda vacía y solo busca por nombre. Un texto
    // alfanumérico sin separadores («AB1234») SÍ es un documento posible: los
    // pasaportes lo son, y probar las dos ramas es gratis.
    const buscar = vi.fn().mockResolvedValue([]);
    await new BuscarPersonas(repo({ buscarPersonas: buscar })).ejecutar('cop-1', 'Ana Pérez');
    expect(buscar.mock.calls[0]!.slice(1, 3)).toEqual(['Ana Pérez', '']);
  });

  it('con menos de dos caracteres NO consulta: recorrería el padrón entero', async () => {
    const buscar = vi.fn();
    const r = await new BuscarPersonas(repo({ buscarPersonas: buscar })).ejecutar('cop-1', 'A');
    expect(r.ok && r.valor).toEqual([]);
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe('RegistrarPersona', () => {
  const entrada = {
    tipoDocumento: 'cedula',
    numeroDocumento: '12.345.678',
    nombreCompleto: '  Ana   Pérez ',
  };

  it('normaliza documento y nombre antes de escribir (RN-06)', async () => {
    const registrar = vi
      .fn()
      .mockResolvedValue({ tipo: 'registrada', id: 'per-9', nombreCompleto: 'Ana Pérez' });
    const r = await new RegistrarPersona(repo({ registrarPersona: registrar })).ejecutar(
      ctx,
      entrada,
    );
    expect(r.ok && r.valor).toEqual({ id: 'per-9', nombreCompleto: 'Ana Pérez', yaExistia: false });
    const alta = registrar.mock.calls[0]![0];
    expect(alta.documento.numero).toBe('12345678');
    expect(alta.nombreCompleto).toBe('Ana Pérez');
  });

  it('un documento que ya existe NO es un error: resuelve a la misma persona', async () => {
    // El documento ES la identidad. Crear una segunda fila sería justo la fuga
    // que la tabla `personas` vino a cerrar.
    const registrar = vi
      .fn()
      .mockResolvedValue({ tipo: 'ya_existia', id: 'per-1', nombreCompleto: 'Ana María Pérez' });
    const r = await new RegistrarPersona(repo({ registrarPersona: registrar })).ejecutar(
      ctx,
      entrada,
    );
    expect(r.ok && r.valor.yaExistia).toBe(true);
    // Y devuelve el nombre REAL, no el que se acaba de teclear.
    expect(r.ok && r.valor.nombreCompleto).toBe('Ana María Pérez');
  });

  it('rechaza documento y nombre inválidos sin tocar el repositorio', async () => {
    const registrar = vi.fn();
    const malos = [
      { ...entrada, numeroDocumento: 'AB#12' },
      { ...entrada, tipoDocumento: 'licencia' },
      { ...entrada, nombreCompleto: ' ' },
    ];
    for (const malo of malos) {
      expect(
        esFallo(
          await new RegistrarPersona(repo({ registrarPersona: registrar })).ejecutar(ctx, malo),
        ),
      ).toBe(true);
    }
    expect(registrar).not.toHaveBeenCalled();
  });

  it('§2.7.6 · una identidad sin copropiedad no da de alta a nadie', async () => {
    const registrar = vi.fn();
    expect(
      esFallo(
        await new RegistrarPersona(repo({ registrarPersona: registrar })).ejecutar(
          sinTenant,
          entrada,
        ),
      ),
    ).toBe(true);
    expect(registrar).not.toHaveBeenCalled();
  });
});
