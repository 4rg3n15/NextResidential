import {
  TIMEOUT_DE_CANAL_SEGUNDOS,
  canalLibre,
  conVencimientosAplicados,
  solicitarCanal,
  soltarCanal,
} from '@ncr/domain-core';
import type {
  EstadoDelCanal,
  EstadoSesionIntercom,
  LecturaDePlaca,
  Reloj,
  ResultadoAccionamiento,
  ResultadoDeAccionamiento,
} from '@ncr/domain-core';
import { ordenAceptada, ordenInalcanzable } from '@ncr/domain-core';
import type { CapacidadesDeEquipo, NombreDeCapacidad } from '../nucleo/capacidades';
import { CAPACIDADES_SIN_CONSULTAR, estadoDe } from '../nucleo/capacidades';
import {
  BibliotecaLlena,
  CapacidadNoSoportada,
  CredencialRechazada,
  EquipoAveriado,
  EquipoOcupado,
  ReinicioNecesario,
} from '../nucleo/errores';
import type { ProveedorDeEquipos } from '../nucleo/proveedor';
import type { VeredictoRemoto } from '../nucleo/verificacion-remota';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * «ÓRBITA» · UNA MARCA QUE NO EXISTE, Y POR QUÉ ESTÁ AQUÍ
 *
 * O2 (ETAPA 15-D) pide la prueba de fuego de la extensibilidad: *un adaptador
 * ficticio de una marca inventada, con capacidades reducidas, pasa la suite de
 * contrato sin que se toque una línea de dominio*. Éste es ese adaptador.
 *
 * Lo que demuestra si la suite pasa: que el contrato que el sistema exige a un
 * proveedor está **completo en `nucleo/`** —capacidades, errores, el tipo del
 * proveedor— y que ninguna parte del sistema necesita saber de qué marca es
 * el aparato para operar. Lo que demuestra si NO pasa: que algo del contrato se
 * quedó dentro de la carpeta de una marca, y hay que subirlo al núcleo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE TIENE PROHIBIDO IMPORTAR
 *
 * Nada de `hikvision/`, `terminal/`, `videoportero/`, `barrera/`, `camara/` ni
 * `equipo/`. Sólo `@ncr/domain-core` y `nucleo/`. Lo vigila
 * `scripts/lib/frontera-extensibilidad.mjs` y rompe la construcción si esta
 * carpeta toca la de otra marca: un ficticio que reutilizara el cliente ISAPI
 * no probaría nada.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CAPACIDADES REDUCIDAS, A PROPÓSITO
 *
 * Un equipo Órbita típico NO tiene biblioteca de rostros ni señalización de
 * llamada, y su audio es de un solo canal. La suite de contrato tiene que
 * aceptar eso **con la misma aserción** que acepta un equipo completo: «si la
 * capacidad es sí, resuelve; si es no, `CapacidadNoSoportada`». Si hiciera
 * falta un `if (esOrbita)` en la suite, el ficticio habría fallado a su
 * propósito.
 */

export type AdversidadFicticia =
  | 'ocupado'
  | 'averiado'
  | 'reinicio_necesario'
  | 'credencial_rechazada'
  | 'inalcanzable'
  | 'biblioteca_llena';

export interface EquipoFicticio {
  readonly dispositivoId: string;
  readonly capacidades: CapacidadesDeEquipo;
  /** Qué le pasa a este equipo cuando se le pide algo. Vacío = sano. */
  readonly adversidad?: AdversidadFicticia;
}

export interface OpcionesFicticias {
  readonly reloj: Reloj;
  readonly equipos: readonly EquipoFicticio[];
  /** Latencia fija que declara: el ficticio no mide nada de verdad. */
  readonly latenciaMs?: number;
}

export class ProveedorFicticio implements ProveedorDeEquipos {
  private readonly equipos = new Map<string, EquipoFicticio>();
  private readonly suscriptores: ((l: LecturaDePlaca) => Promise<void>)[] = [];
  readonly plantillas = new Map<string, Set<string>>();
  readonly bloqueos = new Map<string, boolean>();
  readonly veredictos: { dispositivoId: string; veredicto: VeredictoRemoto }[] = [];
  private readonly canales = new Map<string, EstadoDelCanal>();
  private readonly audio: Uint8Array[] = [];
  private enSesion: string | null = null;

  constructor(private readonly opciones: OpcionesFicticias) {
    for (const equipo of opciones.equipos) this.equipos.set(equipo.dispositivoId, equipo);
  }

  // ── Capacidades ──────────────────────────────────────────────────────────

  async capacidadesDe(dispositivoId: string): Promise<CapacidadesDeEquipo> {
    return this.equipos.get(dispositivoId)?.capacidades ?? CAPACIDADES_SIN_CONSULTAR;
  }

  private exigir(dispositivoId: string, nombre: NombreDeCapacidad): EquipoFicticio {
    const equipo = this.equipos.get(dispositivoId);
    const capacidades = equipo?.capacidades ?? CAPACIDADES_SIN_CONSULTAR;
    const estado = estadoDe(capacidades, nombre);
    if (estado !== 'si' || equipo === undefined) {
      throw new CapacidadNoSoportada(dispositivoId, nombre, estado === 'desconocida');
    }
    return equipo;
  }

  /** La adversidad declarada, como el error NEUTRAL que corresponde. */
  private adversidadDe(equipo: EquipoFicticio): void {
    switch (equipo.adversidad) {
      case 'ocupado':
        throw new EquipoOcupado(equipo.dispositivoId, 'otro operador tiene el control');
      case 'averiado':
        throw new EquipoAveriado(equipo.dispositivoId, 'fallo interno declarado por el equipo');
      case 'reinicio_necesario':
        throw new ReinicioNecesario(equipo.dispositivoId, 'cambio pendiente de reinicio');
      case 'credencial_rechazada':
        throw new CredencialRechazada(equipo.dispositivoId);
      case 'biblioteca_llena':
        throw new BibliotecaLlena(
          equipo.dispositivoId,
          equipo.capacidades.bibliotecaDeRostros.maximo,
        );
      default:
        return;
    }
  }

  private latencia(): number {
    return this.opciones.latenciaMs ?? 12;
  }

  // ── AccessPointProvider ──────────────────────────────────────────────────

  async abrir(dispositivoId: string, _actorId: string): Promise<ResultadoAccionamiento> {
    const equipo = this.exigir(dispositivoId, 'aperturaRemota');
    // Inalcanzable NO lanza: el puerto del dominio devuelve «no aceptado» con
    // la latencia que costó saberlo, igual que los otros adaptadores.
    if (equipo.adversidad === 'inalcanzable')
      return { aceptado: false, latenciaMs: this.latencia() };
    this.adversidadDe(equipo);
    return { aceptado: true, latenciaMs: this.latencia() };
  }

  /** Bloqueo persistente (H-3): sólo si Órbita lo declara para ese equipo. */
  async fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento> {
    const equipo = this.exigir(dispositivoId, 'bloqueoDeAcceso');
    if (equipo.adversidad === 'inalcanzable') {
      return ordenInalcanzable('el equipo no respondió', this.latencia());
    }
    this.adversidadDe(equipo);
    this.bloqueos.set(dispositivoId, bloqueado);
    return ordenAceptada(this.latencia());
  }

  /** A2 · sólo una terminal que declare esperar el veredicto puede recibirlo. */
  async responderVerificacionRemota(
    dispositivoId: string,
    veredicto: VeredictoRemoto,
  ): Promise<ResultadoAccionamiento> {
    const equipo = this.exigir(dispositivoId, 'verificacionRemota');
    if (equipo.adversidad === 'inalcanzable')
      return { aceptado: false, latenciaMs: this.latencia() };
    this.adversidadDe(equipo);
    this.veredictos.push({ dispositivoId, veredicto });
    return { aceptado: true, latenciaMs: this.latencia() };
  }

  async estado(dispositivoId: string): Promise<'en_linea' | 'fuera_de_linea' | 'degradado'> {
    const equipo = this.equipos.get(dispositivoId);
    if (equipo === undefined || equipo.adversidad === 'inalcanzable') return 'fuera_de_linea';
    if (equipo.adversidad === 'credencial_rechazada' || equipo.adversidad === 'averiado') {
      return 'degradado';
    }
    return 'en_linea';
  }

  // ── PlateEventSource ─────────────────────────────────────────────────────

  async suscribir(alLeer: (lectura: LecturaDePlaca) => Promise<void>): Promise<void> {
    this.suscriptores.push(alLeer);
  }

  /** El transporte de Órbita: una lectura ya normalizada por su propio SDK. */
  async entregarLectura(placa: string, dispositivoId: string, confianza = 0.9): Promise<void> {
    this.exigir(dispositivoId, 'reconocimientoDePlacas');
    const lectura: LecturaDePlaca = {
      placa,
      confianza,
      dispositivoId,
      ocurridoEn: this.opciones.reloj.ahora(),
    };
    for (const suscriptor of this.suscriptores) await suscriptor(lectura);
  }

  // ── FaceTemplateProvider ─────────────────────────────────────────────────

  async sincronizar(
    dispositivoId: string,
    plantillaId: string,
    plantilla: Uint8Array,
  ): Promise<void> {
    const equipo = this.exigir(dispositivoId, 'bibliotecaDeRostros');
    if (plantilla.length === 0) {
      throw new Error(`No se sincroniza una plantilla VACÍA para ${plantillaId} (RN-11)`);
    }
    this.adversidadDe(equipo);
    const enEquipo = this.plantillas.get(dispositivoId) ?? new Set<string>();
    const maximo = equipo.capacidades.bibliotecaDeRostros.maximo;
    if (maximo !== null && enEquipo.size >= maximo)
      throw new BibliotecaLlena(dispositivoId, maximo);
    enEquipo.add(plantillaId);
    this.plantillas.set(dispositivoId, enEquipo);
  }

  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    const equipo = this.exigir(dispositivoId, 'bibliotecaDeRostros');
    this.adversidadDe(equipo);
    this.plantillas.get(dispositivoId)?.delete(plantillaId);
  }

  // ── IntercomProvider ─────────────────────────────────────────────────────

  /** La misma máquina de estados del dominio que usan los otros dos. */
  async abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom> {
    const equipo = this.exigir(dispositivoId, 'audioBidireccional');
    this.adversidadDe(equipo);
    const ahora = this.opciones.reloj.ahora();
    const vigente = conVencimientosAplicados(
      this.canales.get(dispositivoId) ?? canalLibre(dispositivoId),
      ahora,
      TIMEOUT_DE_CANAL_SEGUNDOS,
    );
    const solicitud = solicitarCanal(vigente, operadorId, ahora);
    this.canales.set(dispositivoId, solicitud.estado);
    if (solicitud.resultado === 'en_espera') return 'en_espera';
    this.enSesion = dispositivoId;
    return 'abierta';
  }

  async enviarAudio(fragmento: Uint8Array): Promise<void> {
    if (this.enSesion === null) throw new Error('No hay ninguna sesión de audio abierta');
    this.audio.push(fragmento);
  }

  async *recibirAudio(): AsyncIterable<Uint8Array> {
    if (this.enSesion === null) throw new Error('No hay ninguna sesión de audio abierta');
    for (const fragmento of this.audio.splice(0, this.audio.length)) yield fragmento;
  }

  async cerrarSesion(_motivo: string): Promise<void> {
    const dispositivoId = this.enSesion;
    this.enSesion = null;
    if (dispositivoId === null) return;
    const estado = this.canales.get(dispositivoId) ?? canalLibre(dispositivoId);
    if (estado.titular !== null) {
      this.canales.set(
        dispositivoId,
        soltarCanal(estado, estado.titular.operadorId, this.opciones.reloj.ahora()).estado,
      );
    }
  }

  async estadoSesion(): Promise<EstadoSesionIntercom> {
    if (this.enSesion === null) return 'cerrada';
    const estado = this.canales.get(this.enSesion);
    return estado === undefined || estado.titular === null ? 'cerrada' : 'abierta';
  }
}
