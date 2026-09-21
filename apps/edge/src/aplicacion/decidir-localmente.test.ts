import { describe, expect, it } from 'vitest';
import { DecidirLocalmente } from './decidir-localmente';
import type { InstantaneaDeReglas } from './instantanea-de-reglas';
import type { CacheDeReglas } from './puertos';

/**
 * CU-04 excepción 3a · la contingencia, que es la parte que decide sin motor.
 *
 * Es la única puerta por la que el Edge resuelve algo sin preguntar a
 * `evaluarAcceso`, y por eso está probada aparte y con detalle: es donde un
 * descuido abriría una puerta sin que ninguna regla lo hubiera autorizado.
 */
const COP = '11111111-1111-4111-8111-111111111111';

const hecho = {
  dispositivoId: 'camara-01',
  metodo: 'placa' as const,
  referenciaExterna: 'evt-0001',
  confianza: 0.95,
  placaLeida: 'ABC123',
  personaId: null,
  zonaId: null,
  ocurridoEn: new Date('2026-09-21T10:00:00.000Z'),
};

const cache = (instantanea: InstantaneaDeReglas | null): CacheDeReglas => ({
  vigente: () => instantanea,
  guardar: () => true,
});

const motorSin = (contingencia: 'denegar' | 'escalar') =>
  new DecidirLocalmente(cache(null), {
    copropiedadId: COP,
    contingencia,
    cacheObsoletaMinutos: 1440,
  });

describe('contingencia · cuando la regla no está en caché', () => {
  it('DENEGAR por omisión: la puerta no se abre (§2.1.4)', () => {
    const d = motorSin('denegar').decidir(hecho);
    expect(d.resultado.permitido).toBe(false);
    expect(d.porContingencia).toBe(true);
    expect(d.requiereEscalamiento).toBe(false);
  });

  it('ESCALAR TAMPOCO ABRE: pasa el caso a una persona', () => {
    // Es la confusión que hay que impedir. «Escalar» no es «permitir mientras
    // se consulta»: es negar automáticamente y avisar al portero, que es quien
    // decide. Un escalamiento que abriera la puerta sería una regla de acceso
    // fabricada por la ausencia de reglas.
    const d = motorSin('escalar').decidir(hecho);
    expect(d.resultado.permitido).toBe(false);
    expect(d.requiereEscalamiento).toBe(true);
  });

  it('la contingencia SELLA una versión igualmente (CA-21)', () => {
    // Un evento sin versión no se puede auditar, que es lo contrario de lo que
    // CA-21 pide. Se sella, y además viaja marcado como contingencia para que
    // nadie lo confunda con una decisión del motor.
    const d = motorSin('denegar').decidir(hecho);
    expect(d.resultado.versionDeReglas.copropiedadId).toBe(COP);
    expect(d.resultado.versionDeReglas.numero).toBeGreaterThanOrEqual(1);
    expect(d.resultado.permitido).toBe(false);
    if (!d.resultado.permitido) expect(d.resultado.motivo).toBe('FALLO_TECNICO');
  });

  it('sin caché, lo decidido se marca como posiblemente obsoleto', () => {
    // No hay caché de la que afirmar frescura. Decir que está fresca sería
    // afirmar algo que no se sabe.
    expect(motorSin('denegar').decidir(hecho).cachePotencialmenteObsoleto).toBe(true);
  });

  it('una referencia externa inadmisible NO se encola: no habría con qué deduplicar', () => {
    // La clave de idempotencia se construye con la referencia del equipo. Con
    // caracteres que el dominio rechaza no hay clave, y sin clave cada
    // reintento crearía una fila nueva en la nube.
    const d = motorSin('denegar').decidir({ ...hecho, referenciaExterna: 'evt 0001 con espacios' });
    expect(d.claveIdempotencia).toBe('');
    expect(d.resultado.permitido).toBe(false);
  });

  it('ni con una copropiedad imposible se queda un evento SIN sello', () => {
    // Camino de último recurso: `VersionDeReglas` rechaza la copropiedad vacía
    // y aun así hay que sellar algo, porque un evento sin versión no se puede
    // auditar (CA-21). Se sella con una versión marcada como desconocida y el
    // evento viaja además como contingencia, para que nadie lo confunda con
    // una decisión del motor.
    const motor = new DecidirLocalmente(cache(null), {
      copropiedadId: '',
      contingencia: 'denegar',
      cacheObsoletaMinutos: 1440,
    });
    const d = motor.decidir(hecho);
    expect(d.porContingencia).toBe(true);
    expect(d.resultado.versionDeReglas.copropiedadId).toBe('desconocida');
    expect(d.claveIdempotencia, 'sin copropiedad tampoco hay clave').toBe('');
  });

  it('una instantánea a medias no tumba el gateway: cae en contingencia', () => {
    // Escritura truncada por un corte de luz. Sin la guarda, el primer
    // recorrido sobre una colección ausente lanzaba.
    const aMedias = { copropiedadId: COP, version: 2, generadaEn: '2026-09-21T09:00:00.000Z' };
    const motor = new DecidirLocalmente(cache(aMedias as unknown as InstantaneaDeReglas), {
      copropiedadId: COP,
      contingencia: 'denegar',
      cacheObsoletaMinutos: 1440,
    });
    const d = motor.decidir(hecho);
    expect(d.porContingencia).toBe(true);
    expect(d.resultado.reglaAplicada).toBe('edge.cacheIlegible');
  });

  it('una fecha de generación ilegible se trata como obsoleta', () => {
    const rara = {
      copropiedadId: COP,
      version: 2,
      generadaEn: 'no-es-una-fecha',
      autorizaciones: [],
      personasEnListaNegra: [],
      placasEnListaNegra: [],
      viviendasActivas: [],
      vehiculos: [],
      zonas: [],
      personasConConsentimiento: [],
      umbralDeConfianza: 0.7,
    } as InstantaneaDeReglas;
    const motor = new DecidirLocalmente(cache(rara), {
      copropiedadId: COP,
      contingencia: 'denegar',
      cacheObsoletaMinutos: 1440,
    });
    expect(motor.decidir(hecho).cachePotencialmenteObsoleto).toBe(true);
  });

  it('con reglas INYECTADAS se usa el conjunto dado (OCP)', () => {
    // El motor admite otro conjunto de políticas sin tocar su código. Se
    // comprueba con el conjunto vacío, que el dominio resuelve como despliegue
    // incompleto y no como «todo permitido».
    const completa = {
      copropiedadId: COP,
      version: 2,
      generadaEn: '2026-09-21T09:00:00.000Z',
      autorizaciones: [],
      personasEnListaNegra: [],
      placasEnListaNegra: [],
      viviendasActivas: [],
      vehiculos: [],
      zonas: [],
      personasConConsentimiento: [],
      umbralDeConfianza: 0.7,
    } as InstantaneaDeReglas;
    const motor = new DecidirLocalmente(cache(completa), {
      copropiedadId: COP,
      contingencia: 'denegar',
      cacheObsoletaMinutos: 1440,
      reglas: [],
    });
    const d = motor.decidir(hecho);
    expect(d.resultado.permitido).toBe(false);
    expect(d.porContingencia, 'lo resolvió el MOTOR, no la contingencia').toBe(false);
  });

  it('una caché ilegible se trata como ausente, no como vacía', () => {
    // Una instantánea con una versión imposible no produce contexto. Decidir
    // «con lo que se entienda» sería decidir accesos con reglas rotas.
    const rota = { copropiedadId: COP, version: 0 } as unknown as InstantaneaDeReglas;
    const motor = new DecidirLocalmente(cache(rota), {
      copropiedadId: COP,
      contingencia: 'denegar',
      cacheObsoletaMinutos: 1440,
    });
    const d = motor.decidir(hecho);
    expect(d.porContingencia).toBe(true);
    expect(d.resultado.reglaAplicada).toBe('edge.cacheIlegible');
  });
});
