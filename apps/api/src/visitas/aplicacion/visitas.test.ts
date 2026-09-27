import { describe, expect, it, vi } from 'vitest';
import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type {
  AdjuntarFotografiaDeVisitante,
  CrearAutorizacion,
  RepositorioAutorizaciones,
  RevocarAutorizacion,
} from '../../autorizaciones';
import type {
  CapturarRostro,
  SincronizarPlantillaEnTerminales,
  SuprimirRostroDeAutorizacion,
} from '../../biometria';
import type { CanalTiempoReal } from '../../eventos';
import { AvisoDeVisitas } from './aviso-de-visitas';
import {
  DatosParaVolverAAutorizar,
  FotoDeVisitaEnEquipos,
  LIMITE_DE_LISTA,
  ListarVisitas,
  UltimosVisitantes,
  ViviendasParaVisitas,
} from './consultar-visitas';
import { GenerarVisita, hastaDe, revisarForma } from './generar-visita';
import { AlmacenDeFotos } from './lector-de-fotos';
import { TEMA_VISITAS } from './puertos';
import type {
  ConsultaDeVisitas,
  FotoEnEquipo,
  HistorialDeVisitantes,
  PersonasDeVisita,
  VisitaListada,
} from './puertos';
import { RechazarVisita } from './rechazar-visita';
import { RegistrarRostroDeVisita, VERSION_DE_LA_CASILLA, revisarFoto } from './rostro-de-visita';
import type { FotoDeVisita, RostroRegistrado } from './rostro-de-visita';

/**
 * F (15-L) · la capa de aplicación de las visitas, SIN base.
 *
 * `visitas-pg.test.ts` prueba lo mismo de punta a punta contra PostgreSQL; aquí
 * se prueba cada decisión del caso de uso con sus colaboradores sustituidos:
 * el orden (forma antes que nada), la compensación cuando la foto no se
 * registra y los caminos de error. Sin base el CI de controles no ve la otra
 * suite, y la capa quedaba sin medir.
 */

const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-09-27T15:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };

const ctx = (sobre: Partial<ContextoTenant> = {}): ContextoTenant => ({
  usuarioId: 'u-portero',
  rol: 'portero',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: true,
  ...sobre,
});

const como = <T>(o: object): T => o as unknown as T;

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 7),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');

const MEDIDAS_BUENAS = {
  rostrosDetectados: 1,
  nitidez: 0.9,
  iluminacion: 0.6,
  proporcionRostro: 0.4,
};
const FOTO: FotoDeVisita = {
  contenidoBase64: JPEG,
  tipoMime: 'image/jpeg',
  medidas: MEDIDAS_BUENAS,
};

const visita = (sobre: Partial<VisitaListada> = {}): VisitaListada => ({
  autorizacionId: 'a-1',
  visitante: 'Ana',
  documento: '12345',
  viviendaId: 'v-1',
  vivienda: 'Casa 1',
  desde: AHORA,
  hasta: hastaDe(AHORA, 60),
  estado: 'vigente',
  placa: null,
  generadaPor: 'Portero',
  generadaEn: AHORA,
  anuladaEn: null,
  motivoAnulacion: null,
  tieneFoto: true,
  casillaDeclaradaPor: 'Portero',
  casillaEn: AHORA,
  plantillaId: 'p-1',
  consentimientoId: 'c-1',
  confirmadoPorElTitular: false,
  equiposSincronizados: 1,
  equiposFallidos: 0,
  ...sobre,
});

const consulta = (sobre: Partial<ConsultaDeVisitas> = {}): ConsultaDeVisitas => ({
  listar: vi.fn(async () => [visita()]),
  porId: vi.fn(async () => visita()),
  diaDe: vi.fn(async () => ({
    desde: new Date('2026-09-27T05:00:00Z'),
    hasta: new Date('2026-09-28T05:00:00Z'),
  })),
  fotoEnEquipos: vi.fn(async (): Promise<readonly FotoEnEquipo[]> => []),
  viviendas: vi.fn(async () => [{ id: 'v-1', nombre: 'Casa 1' }]),
  ...sobre,
});

const ROSTRO: RostroRegistrado = {
  plantillaId: 'p-1',
  consentimientoId: 'c-1',
  sincronizacion: null,
  avisoDeSincronizacion: null,
};

describe('revisarForma y revisarFoto · antes de crear nada', () => {
  it('sin la casilla, o con una duración fuera de 15 min – 24 h, no hay visita', () => {
    expect(esFallo(revisarForma(false, 60))).toBe(true);
    expect(esFallo(revisarForma(true, 14))).toBe(true);
    expect(esFallo(revisarForma(true, 24 * 60 + 1))).toBe(true);
    expect(esFallo(revisarForma(true, 30.5))).toBe(true);
    expect(esFallo(revisarForma(true, 15))).toBe(false);
  });

  it('la foto se comprueba por su tipo real, su tamaño y su calidad', () => {
    expect(esFallo(revisarFoto({ ...FOTO, tipoMime: 'image/gif' }))).toBe(true);
    expect(esFallo(revisarFoto({ ...FOTO, contenidoBase64: 'A'.repeat(3_000_000) }))).toBe(true);
    expect(esFallo(revisarFoto({ ...FOTO, tipoMime: 'image/png' }))).toBe(true);
    expect(esFallo(revisarFoto({ ...FOTO, contenidoBase64: '' }))).toBe(true);
    expect(esFallo(revisarFoto({ contenidoBase64: JPEG, tipoMime: 'image/jpeg' }))).toBe(true);

    const mala = revisarFoto({ ...FOTO, medidas: { ...MEDIDAS_BUENAS, rostrosDetectados: 2 } });
    expect(mala.ok && !mala.valor.aceptada && mala.valor.motivos.length > 0).toBe(true);
    const buena = revisarFoto(FOTO);
    expect(buena.ok && buena.valor.aceptada).toBe(true);
    // Al volver a autorizar, la calidad ya se midió: no hacen falta medidas.
    const previa = revisarFoto({
      contenidoBase64: JPEG,
      tipoMime: 'image/jpeg',
      calidadPrevia: 88,
    });
    expect(previa.ok && previa.valor.aceptada).toBe(true);
  });
});

describe('GenerarVisita · F1-F3', () => {
  const montar = (rostro = vi.fn(async () => exito(ROSTRO))) => {
    const personas: PersonasDeVisita = { resolver: vi.fn(async () => 'persona-1') };
    const crear = { ejecutar: vi.fn(async () => exito({ id: 'a-1' })) };
    const revocar = { ejecutar: vi.fn(async () => exito(undefined)) };
    const aviso = { nueva: vi.fn(async () => 1) };
    const caso = new GenerarVisita(
      personas,
      como<CrearAutorizacion>(crear),
      como<RevocarAutorizacion>(revocar),
      como<RegistrarRostroDeVisita>({ ejecutar: rostro }),
      como<AvisoDeVisitas>(aviso),
    );
    return { caso, personas, crear, revocar, aviso, rostro };
  };
  const entrada = {
    visitante: { nombre: 'Ana', tipoDocumento: 'cedula' as const, documento: '12345' },
    viviendaId: 'v-1',
    inicio: AHORA,
    duracionMinutos: 120,
    placa: null,
    observaciones: null,
    foto: FOTO,
    casillaMarcada: true,
  };

  it('crea la autorización con su vigencia, registra la foto y avisa en vivo', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx(), entrada);
    expect(r.ok && r.valor.generada).toBe(true);
    expect(m.crear.ejecutar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        personaId: 'persona-1',
        desde: AHORA.toISOString(),
        hasta: hastaDe(AHORA, 120).toISOString(),
      }),
    );
    expect(m.aviso.nueva).toHaveBeenCalledWith(COP, 'a-1');
    expect(m.revocar.ejecutar).not.toHaveBeenCalled();
  });

  it('sin copropiedad, sin casilla o con una foto que no sirve, no crea nada', async () => {
    const m = montar();
    expect(esFallo(await m.caso.ejecutar(ctx({ copropiedadId: null }), entrada))).toBe(true);
    expect(esFallo(await m.caso.ejecutar(ctx(), { ...entrada, casillaMarcada: false }))).toBe(true);
    expect(
      esFallo(
        await m.caso.ejecutar(ctx(), { ...entrada, foto: { ...FOTO, tipoMime: 'image/gif' } }),
      ),
    ).toBe(true);
    const mala = await m.caso.ejecutar(ctx(), {
      ...entrada,
      foto: { ...FOTO, medidas: { ...MEDIDAS_BUENAS, nitidez: 0.01 } },
    });
    expect(mala.ok && !mala.valor.generada).toBe(true);
    expect(m.personas.resolver).not.toHaveBeenCalled();
    expect(m.crear.ejecutar).not.toHaveBeenCalled();
  });

  it('si la autorización no se crea, no hay foto ni aviso', async () => {
    const m = montar();
    m.crear.ejecutar.mockResolvedValueOnce(
      como(fallo(errorDominio('INVARIANTE_VIOLADA', 'Vivienda inactiva'))),
    );
    expect(esFallo(await m.caso.ejecutar(ctx(), entrada))).toBe(true);
    expect(m.rostro).not.toHaveBeenCalled();
    expect(m.aviso.nueva).not.toHaveBeenCalled();
  });

  it('si la foto no se registra, la autorización se ANULA con el motivo', async () => {
    const m = montar(
      vi.fn(async () => como(fallo(errorDominio('DATO_INVALIDO', 'almacén lleno')))),
    );
    expect(esFallo(await m.caso.ejecutar(ctx(), entrada))).toBe(true);
    expect(m.revocar.ejecutar).toHaveBeenCalledWith(
      expect.anything(),
      'a-1',
      'No se registró la foto: almacén lleno',
    );
    expect(m.aviso.nueva).not.toHaveBeenCalled();
  });

  it('si registrar la foto lanza, la anula también y deja pasar el error', async () => {
    const m = montar(
      vi.fn(async () => {
        throw new Error('almacén caído');
      }),
    );
    await expect(m.caso.ejecutar(ctx(), entrada)).rejects.toThrow('almacén caído');
    expect(m.revocar.ejecutar).toHaveBeenCalledWith(
      expect.anything(),
      'a-1',
      'No se pudo guardar la foto',
    );
  });
});

describe('RegistrarRostroDeVisita · F3 y F4', () => {
  const montar = () => {
    const adjuntar = { ejecutar: vi.fn(async () => exito({ clave: 'k' })) };
    const capturar = {
      ejecutar: vi.fn(async () =>
        exito({ aceptada: true, plantillaId: 'p-1', consentimientoId: 'c-1' }),
      ),
    };
    const enTerminales = {
      ejecutar: vi.fn(async () => exito({ sincronizadas: 1, fallidas: 0 })),
    };
    const casillas = { anotar: vi.fn(async () => undefined) };
    const caso = new RegistrarRostroDeVisita(
      como<AdjuntarFotografiaDeVisitante>(adjuntar),
      como<CapturarRostro>(capturar),
      como<SincronizarPlantillaEnTerminales>(enTerminales),
      casillas,
      reloj,
    );
    return { caso, adjuntar, capturar, enTerminales, casillas };
  };
  const entrada = { autorizacionId: 'a-1', titularId: 'persona-1', hasta: AHORA, foto: FOTO };

  it('anota la casilla con quién, cuándo y la versión del SERVIDOR, y declara el consentimiento', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx(), entrada);
    expect(r.ok && r.valor.plantillaId).toBe('p-1');
    expect(m.casillas.anotar).toHaveBeenCalledWith(COP, 'a-1', {
      declaradoPor: 'u-portero',
      en: AHORA,
      version: VERSION_DE_LA_CASILLA,
    });
    expect(m.capturar.ejecutar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        canal: 'presencial',
        suprimirEn: AHORA,
        declaracion: { declaradoPor: 'u-portero' },
        medidas: MEDIDAS_BUENAS,
      }),
    );
  });

  it('desde la app el canal es «app», y la calidad previa viaja en lugar de las medidas', async () => {
    const m = montar();
    await m.caso.ejecutar(ctx({ rol: 'residente' }), {
      ...entrada,
      foto: { contenidoBase64: JPEG, tipoMime: 'image/jpeg', calidadPrevia: 88 },
    });
    const llamada = m.capturar.ejecutar.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(llamada[1]).toMatchObject({ canal: 'app', calidadPrevia: 88 });
    expect(llamada[1]).not.toHaveProperty('medidas');
  });

  it('que los equipos no la acepten no deshace nada: se dice por qué', async () => {
    const m = montar();
    m.enTerminales.ejecutar.mockResolvedValueOnce(
      como(fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Ningún equipo con rostros'))),
    );
    const r = await m.caso.ejecutar(ctx(), entrada);
    expect(r.ok && r.valor.sincronizacion).toBeNull();
    expect(r.ok && r.valor.avisoDeSincronizacion).toBe('Ningún equipo con rostros');
  });

  it('sin copropiedad, con la foto rechazada al adjuntarla o por calidad, falla', async () => {
    const m = montar();
    expect(esFallo(await m.caso.ejecutar(ctx({ copropiedadId: null }), entrada))).toBe(true);

    m.adjuntar.ejecutar.mockResolvedValueOnce(como(fallo(errorDominio('DATO_INVALIDO', 'tipo'))));
    expect(esFallo(await m.caso.ejecutar(ctx(), entrada))).toBe(true);

    m.capturar.ejecutar.mockResolvedValueOnce(
      como(fallo(errorDominio('OPERACION_NO_PERMITIDA', 'sin titular'))),
    );
    expect(esFallo(await m.caso.ejecutar(ctx(), entrada))).toBe(true);

    m.capturar.ejecutar.mockResolvedValueOnce(
      como(exito({ aceptada: false, motivos: ['NITIDEZ'] })),
    );
    const r = await m.caso.ejecutar(ctx(), entrada);
    expect(!r.ok && r.error.detalle).toMatch(/calidad/);
  });
});

describe('RechazarVisita · F2', () => {
  const montar = () => {
    const revocar = { ejecutar: vi.fn(async () => exito(undefined)) };
    const suprimir = {
      ejecutar: vi.fn(async () => exito({ suprimidas: 1, retiradas: 1, retiradasPendientes: 0 })),
    };
    const c = consulta({
      fotoEnEquipos: vi.fn(async () => [
        {
          dispositivoId: 'd-1',
          equipo: 'Terminal',
          estado: 'suprimida',
          detalle: null,
          intentos: 1,
          actualizadoEn: AHORA,
        },
        {
          dispositivoId: 'd-2',
          equipo: 'Portero',
          estado: 'sincronizada',
          detalle: null,
          intentos: 1,
          actualizadoEn: AHORA,
        },
      ]),
    });
    const aviso = { anulada: vi.fn(async () => 1) };
    const caso = new RechazarVisita(
      como<RevocarAutorizacion>(revocar),
      como<SuprimirRostroDeAutorizacion>(suprimir),
      c,
      como<AvisoDeVisitas>(aviso),
    );
    return { caso, revocar, suprimir, aviso };
  };

  it('anula, retira la foto de los equipos, cuenta los pendientes y avisa', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx(), { autorizacionId: 'a-1', motivo: '  No lo esperan ' });
    expect(r.ok && r.valor).toEqual({ equiposRetirados: 1, equiposPendientes: 1 });
    expect(m.revocar.ejecutar).toHaveBeenCalledWith(expect.anything(), 'a-1', 'No lo esperan');
    expect(m.suprimir.ejecutar).toHaveBeenCalledWith(expect.anything(), 'a-1');
    expect(m.aviso.anulada).toHaveBeenCalledWith(COP, 'a-1');
  });

  it('sin copropiedad o sin motivo no se rechaza; si la revocación o la supresión fallan, se dice', async () => {
    const m = montar();
    expect(
      esFallo(
        await m.caso.ejecutar(ctx({ copropiedadId: null }), {
          autorizacionId: 'a-1',
          motivo: 'x y z',
        }),
      ),
    ).toBe(true);
    expect(esFallo(await m.caso.ejecutar(ctx(), { autorizacionId: 'a-1', motivo: ' ab ' }))).toBe(
      true,
    );
    expect(m.revocar.ejecutar).not.toHaveBeenCalled();

    m.revocar.ejecutar.mockResolvedValueOnce(
      como(fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'no'))),
    );
    expect(esFallo(await m.caso.ejecutar(ctx(), { autorizacionId: 'a-1', motivo: 'motivo' }))).toBe(
      true,
    );
    expect(m.suprimir.ejecutar).not.toHaveBeenCalled();

    m.suprimir.ejecutar.mockResolvedValueOnce(como(fallo(errorDominio('DATO_INVALIDO', 'boveda'))));
    expect(esFallo(await m.caso.ejecutar(ctx(), { autorizacionId: 'a-1', motivo: 'motivo' }))).toBe(
      true,
    );
    expect(m.aviso.anulada).not.toHaveBeenCalled();
  });
});

describe('AvisoDeVisitas · el canal en vivo', () => {
  const bitacora = (): Bitacora & { registrar: ReturnType<typeof vi.fn> } =>
    como({ registrar: vi.fn() });

  it('publica la visita en el tema de visitas, nueva o anulada', async () => {
    const canal = { publicar: vi.fn(async () => 2) };
    const aviso = new AvisoDeVisitas(como<CanalTiempoReal>(canal), consulta(), reloj, bitacora());
    expect(await aviso.nueva(COP, 'a-1')).toBe(2);
    expect(await aviso.anulada(COP, 'a-1')).toBe(2);
    expect(canal.publicar).toHaveBeenCalledWith(COP, TEMA_VISITAS, {
      tipo: 'anulada',
      visita: visita(),
    });
  });

  it('una visita que ya no existe no se publica; un canal caído no tumba la operación', async () => {
    const canal = { publicar: vi.fn(async () => 1) };
    const sinVisita = new AvisoDeVisitas(
      como<CanalTiempoReal>(canal),
      consulta({ porId: vi.fn(async () => null) }),
      reloj,
      bitacora(),
    );
    expect(await sinVisita.nueva(COP, 'a-x')).toBe(0);
    expect(canal.publicar).not.toHaveBeenCalled();

    const b = bitacora();
    const caido = new AvisoDeVisitas(
      como<CanalTiempoReal>({
        publicar: vi.fn(async () => {
          throw new Error('canal caído');
        }),
      }),
      consulta(),
      reloj,
      b,
    );
    expect(await caido.nueva(COP, 'a-1')).toBe(0);
    expect(b.registrar).toHaveBeenCalledWith(
      'aviso',
      expect.stringContaining('no se pudo avisar'),
      expect.objectContaining({ error: 'canal caído' }),
    );
  });
});

describe('consultas · F5, F6 y F7', () => {
  it('portería y central ven SÓLO el día, aunque pidan otro rango', async () => {
    const c = consulta();
    const r = await new ListarVisitas(c, reloj).ejecutar(ctx({ rol: 'operador_central' }), {
      desde: new Date('2026-01-01T00:00:00Z'),
      hasta: null,
      viviendaId: 'v-9',
      estado: 'vencida',
      texto: '  ana  ',
    });
    expect(r.ok && r.valor.soloElDia).toBe(true);
    expect(c.listar).toHaveBeenCalledWith(
      COP,
      expect.objectContaining({
        desde: new Date('2026-09-27T05:00:00Z'),
        viviendaId: null,
        estado: null,
        texto: 'ana',
        limite: LIMITE_DE_LISTA,
      }),
    );
  });

  it('administración filtra; un texto en blanco no filtra', async () => {
    const c = consulta();
    const peticion = {
      desde: null,
      hasta: null,
      viviendaId: 'v-1',
      estado: 'vigente' as const,
      texto: '   ',
    };
    const r = await new ListarVisitas(c, reloj).ejecutar(
      ctx({ rol: 'superadministrador' }),
      peticion,
    );
    expect(r.ok && r.valor.soloElDia).toBe(false);
    expect(c.listar).toHaveBeenCalledWith(
      COP,
      expect.objectContaining({ viviendaId: 'v-1', texto: null }),
    );
    expect(
      esFallo(await new ListarVisitas(c, reloj).ejecutar(ctx({ copropiedadId: null }), peticion)),
    ).toBe(true);
  });

  it('los equipos de una visita sólo si la visita es de la copropiedad', async () => {
    const c = consulta();
    expect((await new FotoDeVisitaEnEquipos(c).ejecutar(ctx(), 'a-1')).ok).toBe(true);
    const otra = new FotoDeVisitaEnEquipos(consulta({ porId: vi.fn(async () => null) }));
    expect(esFallo(await otra.ejecutar(ctx(), 'a-otra'))).toBe(true);
    expect(esFallo(await otra.ejecutar(ctx({ copropiedadId: null }), 'a-1'))).toBe(true);
  });

  it('las viviendas para elegir, con copropiedad', async () => {
    const caso = new ViviendasParaVisitas(consulta());
    const r = await caso.ejecutar(ctx());
    expect(r.ok && r.valor).toEqual([{ id: 'v-1', nombre: 'Casa 1' }]);
    expect(esFallo(await caso.ejecutar(ctx({ copropiedadId: null })))).toBe(true);
  });

  it('los últimos visitantes, con un tope de 50 por mucho que se pida', async () => {
    const historial: HistorialDeVisitantes = {
      ultimosDeVivienda: vi.fn(async () => []),
      paraRepetir: vi.fn(async () => null),
    };
    await new UltimosVisitantes(historial).ejecutar(COP, 'v-1', 500);
    expect(historial.ultimosDeVivienda).toHaveBeenCalledWith(COP, 'v-1', 50);
  });

  it('volver a autorizar copia datos y foto, sólo de la propia vivienda', async () => {
    const datos = { visitante: 'Ana', documento: '12345', placa: null, calidad: 88 };
    const historial: HistorialDeVisitantes = {
      ultimosDeVivienda: vi.fn(async () => []),
      paraRepetir: vi.fn(async (_c: string, vivienda: string) =>
        vivienda === 'v-1' ? datos : null,
      ),
    };
    const bytes = Buffer.from(JPEG, 'base64');
    const repo = como<RepositorioAutorizaciones>({
      fotografiaDe: vi.fn(async (_c: string, id: string) =>
        id === 'a-sin-foto' ? null : { clave: `k/${id}`, tipoMime: 'image/jpeg' },
      ),
    });
    const lector = { leer: vi.fn(async (clave: string) => (clave === 'k/a-vacia' ? null : bytes)) };
    const caso = new DatosParaVolverAAutorizar(historial, new AlmacenDeFotos(repo, lector));

    const r = await caso.ejecutar(COP, 'v-1', 'a-1');
    expect(r.ok && r.valor.foto).toEqual({ contenidoBase64: JPEG, tipoMime: 'image/jpeg' });
    const sinFoto = await caso.ejecutar(COP, 'v-1', 'a-sin-foto');
    expect(sinFoto.ok && sinFoto.valor.foto).toBeNull();
    const vacia = await caso.ejecutar(COP, 'v-1', 'a-vacia');
    expect(vacia.ok && vacia.valor.foto).toBeNull();
    expect(esFallo(await caso.ejecutar(COP, 'v-otra', 'a-1'))).toBe(true);
  });
});
