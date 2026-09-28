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
  readonly equipos: readonly EquipoDeEnsayo[];
  readonly interlocutorDe: (familia: FamiliaDeEnsayo) => Interlocutor;
  readonly plataforma: EventosDeLaPlataforma;
  readonly verificaciones: VerificacionesDeLaPlataforma;
  readonly receptorEsperado: ReceptorEsperado;
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

/** Quien «mira» contesta lo que el simulado ACCIONÓ, y lo dice por `avisar`. */
const personaSimulada = (avisar: (linea: string) => void) => {
  let antes = 0;
  let destino = '';
  return (familia: FamiliaDeEnsayo): Interlocutor => ({
    indicar: async (texto) => {
      destino = `${familia}.simulado.invalid`;
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
  const flujo = new FlujoEnVivo();
  const guion = (familia: FamiliaDeEnsayo, extra: Partial<GuionDeEquipo>): typeof fetch =>
    equiposSimulados({
      [`${familia}.simulado.invalid`]: {
        familia,
        usuario: USUARIO,
        clave: CLAVE,
        hora: horaDeBogota(),
        ...extra,
      },
    });
  const peticiones: Readonly<Record<FamiliaDeEnsayo, typeof fetch>> = {
    camara: guion('camara', {
      receptor: {
        ip: RED_DEL_MAC['en-simulada'][0].address,
        puerto: PUERTO_DE_LA_API,
        url: `/alarm-server/${SECRETO_DEL_RECEPTOR_SIMULADO}`,
      },
    }),
    terminal: guion('terminal', { verificacionRemota: true, enVivo: flujo }),
    videoportero: guion('videoportero', {
      aperturaRemota: true,
      canalesDeAudio: [{ id: 1, habilitado: true, codec: 'G.711ulaw' }],
      bibliotecaEnVideoportero: true,
    }),
  };
  // HTTP al simulado de su familia; RTSP al servidor del bucle local.
  const equipoDe = (familia: FamiliaDeEnsayo): EquipoDeEnsayo => ({
    familia,
    host: '127.0.0.1',
    usuario: USUARIO,
    clave: CLAVE,
    puerta: 1,
    canalDeVideo: '102',
    puertoRtsp: rtsp.puerto,
    peticion: (async (u: string | URL, o?: RequestInit) => {
      const url = new URL(String(u));
      url.hostname = `${familia}.simulado.invalid`;
      return peticiones[familia](url, o);
    }) as typeof fetch,
  });
  const equipos = (['camara', 'terminal', 'videoportero'] as const).map(equipoDe);
  const terminal = equipos[1];
  if (terminal === undefined) throw new Error('el ensayo simulado perdió la terminal');
  return {
    equipos,
    interlocutorDe: personaSimulada(avisar),
    plataforma: {
      primeroDesde: async () => ({ titulo: 'Evento simulado', ocurridoEn: new Date() }),
    },
    verificaciones: new VerificacionesSimuladas({ conexion: terminal, flujo }),
    receptorEsperado: {
      direccion: ipHaciaElEquipo(HOST_DE_LA_CAMARA, RED_DEL_MAC),
      puerto: PUERTO_DE_LA_API,
      secretos: [SECRETO_DEL_RECEPTOR_SIMULADO],
    },
    entorno: {
      PROVEEDOR_DE_EQUIPOS: PROVEEDORES_REALES[0],
      DATABASE_URL: 'postgresql://ensayo@pooler.simulado.invalid:5432/postgres',
    },
    equiposReales: equipos.length,
    cerrar: () => rtsp.cerrar(),
  };
};
