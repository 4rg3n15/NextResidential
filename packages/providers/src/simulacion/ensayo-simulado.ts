import { ipHaciaElEquipo } from '../red/ip-hacia-el-equipo';
import { PROVEEDORES_REALES } from '../ensayo/comprobaciones-de-plataforma';
import type { EntornoDeLaPlataforma } from '../ensayo/comprobaciones-de-plataforma';
import type {
  EquipoDeEnsayo,
  EventosDeLaPlataforma,
  FamiliaDeEnsayo,
  Interlocutor,
  ReceptorEsperado,
  VerificacionesDeLaPlataforma,
} from '../ensayo/tipos';
import { aperturasFisicasPor, equiposSimulados } from './equipo-simulado';
import type { GuionDeEquipo } from './equipo-simulado';
import { servidorRtspSimulado } from './servidor-rtsp';
import { FlujoEnVivo } from './verificacion-remota-simulada';
import { VerificacionesSimuladas } from './verificaciones-simuladas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `pnpm sitio:ensayo -- --simulado` · LOS TRES EQUIPOS Y LA PLATAFORMA, SIN RED
 *
 * Vivía dentro del guion; ahora vive aquí para que el guion no crezca con cada
 * comprobación nueva y para que una PRUEBA monte exactamente lo mismo que el
 * guion (`ensayo-simulado.test.ts`: el `--simulado` termina SIN FALLOS).
 *
 *  · La cámara publica en «este Mac» de una red de documentación (RFC 5737):
 *    la comparación de C2 corre de verdad con `ipHaciaElEquipo`.
 *  · La terminal espera el veredicto y su flujo queda abierto: el paso 9 (F2)
 *    hace cinco ciclos completos con las piezas de producción.
 *  · El videoportero declara biblioteca de rostros: el paso 6 le da de alta,
 *    busca y da de baja un rostro de prueba, como a la terminal (F4).
 *  · La API simulada tiene el proveedor real y pg-boss por el pooler de sesión:
 *    las comprobaciones de la plataforma (F3, C1) dicen OK con sus razones.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SECRETO_DEL_RECEPTOR_SIMULADO = 'secreto-simulado-del-receptor-sin-valor';
/** C6 (15-M) · la SEGUNDA cámara publica con OTRO secreto: uno por cámara. */
export const SECRETO_DEL_RECEPTOR_SIMULADO_2 = 'secreto-simulado-de-la-segunda-camara-sin-valor';

const USUARIO = 'servicio';
const CLAVE = 'clave-simulada';
const PUERTO_DE_LA_API = 3000;
/** El Mac y la cámara, en una red de documentación: ninguna es de un equipo real. */
const RED_DEL_MAC = {
  'en-simulada': [
    { address: '198.51.100.10', netmask: '255.255.255.0', family: 'IPv4', internal: false },
  ],
} as const;
const HOST_DE_LA_CAMARA = '198.51.100.20';

export interface EnsayoSimulado {
  /** C6 · SEIS equipos: dos cámaras, dos terminales, dos videoporteros (N por familia). */
  readonly equipos: readonly EquipoDeEnsayo[];
  readonly interlocutorDe: (familia: FamiliaDeEnsayo, equipo?: EquipoDeEnsayo) => Interlocutor;
  readonly plataforma: EventosDeLaPlataforma;
  /** Las de la PRIMERA terminal (compatibilidad); `verificacionesDe` las de cada una. */
  readonly verificaciones: VerificacionesDeLaPlataforma;
  readonly verificacionesDe: (equipo: EquipoDeEnsayo) => VerificacionesDeLaPlataforma;
  /** El receptor de la PRIMERA cámara (compatibilidad); `receptorEsperadoDe` el de cada una. */
  readonly receptorEsperado: ReceptorEsperado;
  readonly receptorEsperadoDe: (equipo: EquipoDeEnsayo) => ReceptorEsperado;
  readonly entorno: EntornoDeLaPlataforma;
  readonly equiposReales: number;
  cerrar(): Promise<void>;
}

const horaDeBogota = (): string =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'medium',
  })
    .format(new Date())
    .replace(' ', 'T') + '-05:00';

/**
 * Quien «mira» contesta lo que el simulado ACCIONÓ, y lo dice por `avisar`.
 * C6 · mira el equipo por su NOMBRE DE HOST simulado (hay dos por familia).
 */
const personaSimulada = (avisar: (linea: string) => void) => {
  let antes = 0;
  let destino = '';
  return (familia: FamiliaDeEnsayo, host = `${familia}-1.simulado.invalid`): Interlocutor => ({
    indicar: async (texto) => {
      destino = host;
      antes = aperturasFisicasPor.get(destino) ?? 0;
      avisar(`     ▶ ${texto}`);
    },
    confirmar: async (pregunta) => {
      const r = /pitido/.test(pregunta) ? true : (aperturasFisicasPor.get(destino) ?? 0) > antes;
      avisar(`     ? ${pregunta} — ${r ? 'sí' : 'no'} (simulado)`);
      return r;
    },
  });
};

export const montarEnsayoSimulado = async (
  avisar: (linea: string) => void,
): Promise<EnsayoSimulado> => {
  const rtsp = await servidorRtspSimulado({
    usuario: USUARIO,
    clave: CLAVE,
    canales: { 102: 'H264' },
  });
  /** C6 · un flujo en vivo POR TERMINAL: el flujo simulado admite un solo lector. */
  const flujos = new Map<string, FlujoEnVivo>();
  const flujoDe = (host: string): FlujoEnVivo => {
    const f = flujos.get(host) ?? new FlujoEnVivo();
    flujos.set(host, f);
    return f;
  };
  /**
   * C6 · DOS equipos por familia, cada uno con su propio nombre de host
   * simulado, su nombre de ficha y —las cámaras— su propio secreto de
   * receptor. Es lo que el registro de la consola produce con N equipos.
   */
  const receptor = (secreto: string) => ({
    ip: RED_DEL_MAC['en-simulada'][0].address,
    puerto: PUERTO_DE_LA_API,
    url: `/alarm-server/${secreto}`,
  });
  const secretoDeCamara: Readonly<Record<string, string>> = {
    'camara-1.simulado.invalid': SECRETO_DEL_RECEPTOR_SIMULADO,
    'camara-2.simulado.invalid': SECRETO_DEL_RECEPTOR_SIMULADO_2,
  };
  const guionDe = (familia: FamiliaDeEnsayo, host: string): GuionDeEquipo => {
    const base = { familia, usuario: USUARIO, clave: CLAVE, hora: horaDeBogota() };
    if (familia === 'camara') {
      return {
        ...base,
        receptor: receptor(secretoDeCamara[host] ?? SECRETO_DEL_RECEPTOR_SIMULADO),
      };
    }
    if (familia === 'terminal') return { ...base, verificacionRemota: true, enVivo: flujoDe(host) };
    return {
      ...base,
      aperturaRemota: true,
      canalesDeAudio: [{ id: 1, habilitado: true, codec: 'G.711ulaw' }],
      bibliotecaEnVideoportero: true,
    };
  };
  const NOMBRES: Readonly<Record<FamiliaDeEnsayo, readonly [string, string]>> = {
    camara: ['Cámara entrada', 'Cámara salida'],
    terminal: ['Terminal peatonal', 'Terminal piscina'],
    videoportero: ['Videoportero norte', 'Videoportero sur'],
  };
  const hosts = (['camara', 'terminal', 'videoportero'] as const).flatMap((familia) =>
    [1, 2].map((n) => ({ familia, host: `${familia}-${String(n)}.simulado.invalid`, n })),
  );
  const peticion = equiposSimulados(
    Object.fromEntries(hosts.map(({ familia, host }) => [host, guionDe(familia, host)])),
  );
  // HTTP al simulado de SU host; RTSP al servidor del bucle local.
  const equipoDe = ({
    familia,
    host,
    n,
  }: {
    familia: FamiliaDeEnsayo;
    host: string;
    n: number;
  }): EquipoDeEnsayo => ({
    familia,
    nombre: NOMBRES[familia][n === 1 ? 0 : 1],
    host: '127.0.0.1',
    usuario: USUARIO,
    clave: CLAVE,
    puerta: 1,
    canalDeVideo: '102',
    puertoRtsp: rtsp.puerto,
    peticion: (async (u: string | URL, o?: RequestInit) => {
      const url = new URL(String(u));
      url.hostname = host;
      return peticion(url, o);
    }) as typeof fetch,
  });
  const equipos = hosts.map(equipoDe);
  const terminal = equipos.find((e) => e.familia === 'terminal');
  if (terminal === undefined) throw new Error('el ensayo simulado perdió la terminal');
  const hostDe = (equipo: EquipoDeEnsayo): string =>
    hosts.find((h) => h.familia === equipo.familia && NOMBRES[h.familia][h.n - 1] === equipo.nombre)
      ?.host ?? `${equipo.familia}-1.simulado.invalid`;
  const persona = personaSimulada(avisar);
  const verificacionesDe = (equipo: EquipoDeEnsayo): VerificacionesDeLaPlataforma =>
    new VerificacionesSimuladas({ conexion: equipo, flujo: flujoDe(hostDe(equipo)) });
  const receptorEsperadoDe = (equipo: EquipoDeEnsayo): ReceptorEsperado => ({
    direccion: ipHaciaElEquipo(HOST_DE_LA_CAMARA, RED_DEL_MAC),
    puerto: PUERTO_DE_LA_API,
    secretos: [secretoDeCamara[hostDe(equipo)] ?? SECRETO_DEL_RECEPTOR_SIMULADO],
  });
  return {
    equipos,
    // El guion pide el interlocutor por familia; aquí se resuelve al PRIMER
    // equipo de esa familia salvo que se pida por equipo (`interlocutorDe` con
    // el equipo en `equipos` lo hace `personaSimulada` por host).
    interlocutorDe: (familia: FamiliaDeEnsayo, equipo?: EquipoDeEnsayo) =>
      persona(familia, equipo === undefined ? undefined : hostDe(equipo)),
    plataforma: {
      primeroDesde: async () => ({ titulo: 'Evento simulado', ocurridoEn: new Date() }),
    },
    verificaciones: verificacionesDe(terminal),
    verificacionesDe,
    receptorEsperado: {
      direccion: ipHaciaElEquipo(HOST_DE_LA_CAMARA, RED_DEL_MAC),
      puerto: PUERTO_DE_LA_API,
      secretos: [SECRETO_DEL_RECEPTOR_SIMULADO],
    },
    receptorEsperadoDe,
    entorno: {
      PROVEEDOR_DE_EQUIPOS: PROVEEDORES_REALES[0],
      DATABASE_URL: 'postgresql://ensayo@pooler.simulado.invalid:5432/postgres',
    },
    equiposReales: equipos.length,
    cerrar: () => rtsp.cerrar(),
  };
};
