import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import type { Aforo } from './aforo';
import type { HorarioDeZona } from './horario-zona';
import type { PoliticaReinicio } from './politica-reinicio';
import { debeReiniciarAforo } from './politica-reinicio';

/** Espejo del enumerado `tipo_zona` de la migración 0002. */
export const TIPOS_DE_ZONA = ['vehicular', 'peatonal', 'comun'] as const;
export type TipoDeZona = (typeof TIPOS_DE_ZONA)[number];

const MAX_NORMAS = 30;
const MAX_LARGO_NORMA = 300;

/**
 * Agregado raíz `Zona` — RN-14, CU-05, HU-18 a HU-20.
 *
 * Su frontera de consistencia es **horario, aforo y controladores**: las tres
 * cosas que deciden si alguien entra a esta zona, y ninguna más. Los visitantes
 * autorizados a la zona NO están dentro: pertenecen a `Autorización`, que es
 * quien sabe a quién alcanza (`alcanzaZona`). Meterlos aquí obligaría a cargar
 * la zona entera para responder a una pregunta de la autorización.
 *
 * Cambia por **métodos de intención** y cada uno devuelve una instancia nueva
 * (§2.4). La zona congelada no admite asignación externa.
 */
export class Zona {
  private constructor(
    readonly id: string,
    readonly copropiedadId: string,
    readonly nombre: string,
    readonly tipo: TipoDeZona,
    readonly abierta: boolean,
    readonly politicaReinicio: PoliticaReinicio,
    readonly normas: readonly string[],
    readonly horario: HorarioDeZona,
    readonly aforo: Aforo,
    readonly controladores: readonly string[],
    readonly ultimoReinicio: Date | null,
    readonly activa: boolean,
  ) {
    Object.freeze(this);
  }

  static crear(datos: {
    id: string;
    copropiedadId: string;
    nombre: string;
    tipo: TipoDeZona;
    horario: HorarioDeZona;
    aforo: Aforo;
    politicaReinicio?: PoliticaReinicio;
    normas?: readonly string[];
    controladores?: readonly string[];
    abierta?: boolean;
    ultimoReinicio?: Date | null;
    activa?: boolean;
  }): Resultado<Zona, ErrorDominio> {
    const nombre = datos.nombre.trim();
    if (nombre.length === 0 || nombre.length > 100) {
      return fallo(errorDominio('DATO_INVALIDO', 'El nombre de la zona tiene 1..100 caracteres'));
    }
    if (datos.copropiedadId.length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'Toda zona pertenece a una copropiedad', 'RN-15'));
    }
    const normas = datos.normas ?? [];
    if (normas.length > MAX_NORMAS || normas.some((n) => n.trim().length > MAX_LARGO_NORMA)) {
      return fallo(errorDominio('DATO_INVALIDO', 'Normas fuera de los límites admitidos'));
    }
    const reinicio = datos.ultimoReinicio ?? null;

    return exito(
      new Zona(
        datos.id,
        datos.copropiedadId,
        nombre,
        datos.tipo,
        datos.abierta ?? true,
        datos.politicaReinicio ?? 'cierre_horario',
        normas.map((n) => n.trim()),
        datos.horario,
        datos.aforo,
        [...(datos.controladores ?? [])],
        reinicio === null ? null : new Date(reinicio.getTime()),
        datos.activa ?? true,
      ),
    );
  }

  /**
   * ¿Admite a alguien AHORA, dejando aparte quién sea?
   *
   * Devuelve el detalle en vez de un booleano porque el motor de reglas
   * distingue tres motivos a propósito —permiso, horario y aforo— y colapsarlos
   * haría indistinguibles CA-14 y CA-15 en el evento (D-18).
   *
   * `abierta = false` se reporta como fuera de horario: para quien está en la
   * puerta es lo mismo, y es lo que el mockup W-06 ofrece al operador como
   * cierre manual sin presencia física (PB-04).
   */
  disponibilidadEn(ahora: Date): {
    readonly dentroDeHorario: boolean;
    readonly aforoCompleto: boolean;
  } {
    const proyectada = this.conAforoAlDia(ahora);
    return {
      dentroDeHorario: this.abierta && this.activa && this.horario.estaAbiertaEn(ahora),
      aforoCompleto: proyectada.aforo.completo,
    };
  }

  /**
   * La zona con el contador reiniciado si tocaba (CU-05 6a, S-09), o la misma
   * instancia si no.
   *
   * Se aplica **al consultar** y no solo en un trabajo programado porque una
   * zona sin tráfico durante días tendría el contador de la última jornada
   * hasta que alguien la mirara. El trabajo de la ETAPA 14 persistirá el
   * reinicio; esta proyección hace que la decisión sea correcta mientras tanto.
   */
  conAforoAlDia(ahora: Date): Zona {
    const toca = debeReiniciarAforo({
      politica: this.politicaReinicio,
      horario: this.horario,
      ultimoReinicio: this.ultimoReinicio,
      ahora,
    });
    if (!toca || this.aforo.actual === 0) return this;
    return this.copiar({ aforo: this.aforo.reiniciar(), ultimoReinicio: ahora });
  }

  /** Cierre o reapertura manual del operador (HU-18, mockup W-06, PB-04). */
  cambiarApertura(abierta: boolean): Zona {
    return abierta === this.abierta ? this : this.copiar({ abierta });
  }

  /**
   * Reconfiguración desde la consola (HU-18). No toca el contador: cambiar el
   * horario o las normas de una zona con gente dentro no la vacía.
   */
  reconfigurar(cambios: {
    nombre?: string;
    horario?: HorarioDeZona;
    aforo?: Aforo;
    politicaReinicio?: PoliticaReinicio;
    normas?: readonly string[];
    controladores?: readonly string[];
  }): Resultado<Zona, ErrorDominio> {
    return Zona.crear({
      id: this.id,
      copropiedadId: this.copropiedadId,
      nombre: cambios.nombre ?? this.nombre,
      tipo: this.tipo,
      horario: cambios.horario ?? this.horario,
      aforo: cambios.aforo ?? this.aforo,
      politicaReinicio: cambios.politicaReinicio ?? this.politicaReinicio,
      normas: cambios.normas ?? this.normas,
      controladores: cambios.controladores ?? this.controladores,
      abierta: this.abierta,
      ultimoReinicio: this.ultimoReinicio,
      activa: this.activa,
    });
  }

  private copiar(cambios: { abierta?: boolean; aforo?: Aforo; ultimoReinicio?: Date }): Zona {
    return new Zona(
      this.id,
      this.copropiedadId,
      this.nombre,
      this.tipo,
      cambios.abierta ?? this.abierta,
      this.politicaReinicio,
      this.normas,
      this.horario,
      cambios.aforo ?? this.aforo,
      this.controladores,
      cambios.ultimoReinicio ?? this.ultimoReinicio,
      this.activa,
    );
  }
}
