/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · LA RAÍZ DE COMPOSICIÓN DEL EDGE COMO PUENTE (ADR-035)
 *
 * Con `EDGE_TUNEL=inactivo` es exactamente el Edge de la 15-Q (`componerEdge`).
 * Con `activo`, el MISMO Edge con cuatro piezas cambiadas por `ExtrasDelPuente`:
 *
 *  · los equipos salen del registro CIFRADO (D1), sembrado con `EDGE_EQUIPOS`
 *    si se declaró; las cámaras del receptor local, también de ahí;
 *  · la sonda inmediata dice siempre «la nube no atiende»: sin túnel, la nube
 *    no alcanza los equipos, y quien decide es el Edge;
 *  · el ingestor es `PuenteConLaNube`: con túnel, reenvía y decide la nube; sin
 *    respuesta a tiempo, la contingencia de la 15-Q (B2);
 *  · al abrirse el túnel se instalan el ejecutor de órdenes (un solo actor:
 *    `padreVigente`) y lo que el Edge atiende de la nube.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { ejecutarOrdenes } from '@ncr/providers';
import type { EquipoRegistrado, SesionDeTunel } from '@ncr/providers';
import { PuenteConLaNube } from './aplicacion/puente-con-la-nube';
import { componerEdge } from './composicion';
import type { ExtrasDeComposicion } from './composicion';
import type { ConfiguracionDelPuente } from './configuracion/esquema-del-puente';
import type { EquipoDelEdge } from './configuracion/esquema-de-sitio';
import { RegistroCifrado, llaveDeEquipos } from './infraestructura/equipos/registro-cifrado';
import type { EquipoDelPuente } from './infraestructura/equipos/registro-cifrado';
import type { CamaraDelEdge } from './infraestructura/http/servidor-local';
import { atenderLaNube, sincronizarCamaras } from './infraestructura/tunel/atenciones-del-edge';
import { ClienteDeTunel } from './infraestructura/tunel/cliente-de-tunel';
import type { OpcionesDelTunel } from './infraestructura/tunel/cliente-de-tunel';
import { Go2rtcLocal } from './infraestructura/video/go2rtc-local';

export interface ExtrasDeLaComposicionDelPuente extends ExtrasDeComposicion {
  /** En las pruebas: el socket hacia la API, el `fetch` del go2rtc, el azar del backoff. */
  readonly tunel?: Partial<
    Pick<OpcionesDelTunel, 'abrirSocket' | 'azar' | 'esperar' | 'backoffBaseMs'>
  >;
  readonly peticionAlGo2rtc?: typeof fetch;
}

const deLaSemilla = (e: EquipoDelEdge): EquipoDelPuente => {
  const equipo: EquipoRegistrado = {
    dispositivoId: e.dispositivoId,
    tipo: e.tipo,
    host: e.host,
    puerto: e.puerto,
    protocolo: e.protocolo,
    usuario: e.usuario,
    clave: e.clave,
    ...(e.canalBarrera === undefined ? {} : { canalBarrera: e.canalBarrera }),
    ...(e.numeroDePuerta === undefined ? {} : { numeroDePuerta: e.numeroDePuerta }),
  };
  return e.secretoAlarmServer === undefined
    ? equipo
    : { ...equipo, secretoAlarmServer: e.secretoAlarmServer };
};

export const componerPuente = (
  config: ConfiguracionDelPuente,
  extras: ExtrasDeLaComposicionDelPuente,
) => {
  if (config.EDGE_TUNEL !== 'activo' || config.EDGE_EQUIPOS_LLAVE === undefined) {
    return { edge: componerEdge(config, extras), tunel: null, puente: null };
  }
  const llave = llaveDeEquipos(config.EDGE_EQUIPOS_LLAVE);
  const ahora = (): Date => extras.reloj?.ahora() ?? new Date();
  let registro: RegistroCifrado | null = null;
  const camaras: CamaraDelEdge[] = [];
  let sesion: SesionDeTunel | null = null;
  const tunel = new ClienteDeTunel({
    urlApi: config.NEXT_CONTROL_API_URL,
    edgeId: config.EDGE_GATEWAY_ID,
    copropiedadId: config.EDGE_COPROPIEDAD_ID,
    credencial: config.EDGE_INGESTA_SECRETO,
    registrar: (nivel, mensaje, contexto) => extras.registrar(nivel, mensaje, contexto),
    ...extras.tunel,
    alAbrir: (s) => {
      sesion = s;
      instalar(s);
    },
  });
  let puente: PuenteConLaNube | null = null;
  const edge = componerEdge(config, {
    ...extras,
    registro: (db) => {
      const r = new RegistroCifrado(db, llave);
      for (const e of config.EDGE_EQUIPOS) {
        if (!r.todos().some((x) => x.dispositivoId === e.dispositivoId))
          r.guardar(deLaSemilla(e), ahora());
      }
      sincronizarCamaras(r, camaras);
      registro = r;
      return r;
    },
    sondaInmediata: { hayEnlace: async () => false },
    envolverIngestor: (local) => {
      puente = new PuenteConLaNube(local, () => tunel.sesion(), {
        plazoMs: config.EDGE_PLAZO_NUBE_MS,
        registrar: (nivel, mensaje, contexto) => extras.registrar(nivel, mensaje, contexto),
      });
      return puente;
    },
    audioDelEquipo: extras.audioDelEquipo ?? 'persistente',
    equipos: () => registro?.todos() ?? [],
    camaras,
  });
  const video = new Go2rtcLocal(config.EDGE_GO2RTC_URL, extras.peticionAlGo2rtc);
  const instalar = (s: SesionDeTunel): void => {
    const conocidos = registro;
    if (conocidos === null || puente === null) return;
    const delPuente = puente;
    ejecutarOrdenes(s, edge.proveedor, {
      conoce: (id) => conocidos.todos().some((e) => e.dispositivoId === id),
      padreVigente: (hecho) => delPuente.enManosDeLaNube(hecho),
      registrar: (mensaje, contexto) => extras.registrar('aviso', mensaje, contexto),
    });
    atenderLaNube(s, {
      registro: conocidos,
      proveedor: edge.proveedor,
      camaras,
      video,
      ahora,
      ...(extras.peticionAEquipos === undefined ? {} : { peticion: extras.peticionAEquipos }),
    });
  };
  return { edge, tunel, puente, sesion: () => sesion };
};
