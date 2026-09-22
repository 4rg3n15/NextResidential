import { debeReiniciarAforo, errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type {
  Aforo,
  ErrorDominio,
  HorarioDeZona,
  MotivoAcceso,
  PoliticaReinicio,
  Reloj,
  Resultado,
  Zona,
} from '@ncr/domain-core';
import type { RepositorioAutorizacionesZona, RepositorioZonas } from './puertos';

/**
 * Veredicto de `ValidarAforo`. Lleva el motivo TIPADO del dominio, no un
 * booleano: CA-14 (aforo) y CA-15 (horario) son criterios distintos y el
 * documento los separa a propósito, así que colapsarlos aquí haría
 * indistinguibles dos denegaciones en el evento que la ETAPA 06 registra.
 */
export type VeredictoDeAforo =
  | { readonly admitido: true; readonly conteo: number }
  | { readonly admitido: false; readonly motivo: MotivoAcceso };

/**
 * Caso de uso `ValidarAforo` — CU-05, RN-14, CA-14, CA-15.
 *
 * El orden de las tres comprobaciones no es casual y es el mismo del motor de
 * reglas: horario antes que aforo. Una zona cerrada con el contador lleno
 * responde `FUERA_DE_HORARIO`, que es el motivo que el operador necesita leer;
 * decir «aforo superado» de una zona que ni siquiera está abierta mandaría a
 * mirar el sitio equivocado.
 *
 * **La ocupación es lo último y la hace la base.** Se consulta la zona para
 * saber si abre, se reinicia el contador si la jornada cerró (CU-05 6a, S-09) y
 * solo entonces se pide la plaza con un incremento atómico. Comprobar el aforo
 * aquí y ocupar después dejaría la ventana de carrera que ADR-04 prohíbe.
 */
export class ValidarAforo {
  constructor(
    private readonly repositorio: RepositorioZonas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(copropiedadId: string, zonaId: string): Promise<VeredictoDeAforo> {
    const ahora = this.reloj.ahora();
    const zona = await this.repositorio.porId(copropiedadId, zonaId);
    if (zona === null) {
      // Denegar por defecto (§2.1.4): una zona que no se puede resolver no es
      // una zona sin restricciones.
      return { admitido: false, motivo: 'FALLO_TECNICO' };
    }

    if (!zona.disponibilidadEn(ahora).dentroDeHorario) {
      return { admitido: false, motivo: 'FUERA_DE_HORARIO' };
    }

    // El reinicio se persiste ANTES de ocupar: si solo se proyectara en
    // memoria, el incremento atómico chocaría contra el contador viejo de la
    // base y negaría plazas que ya están libres.
    if (
      debeReiniciarAforo({
        politica: zona.politicaReinicio,
        horario: zona.horario,
        ultimoReinicio: zona.ultimoReinicio,
        ahora,
      })
    ) {
      await this.repositorio.reiniciar(copropiedadId, zonaId, ahora);
    }

    const ocupacion = await this.repositorio.ocupar(copropiedadId, zonaId);
    switch (ocupacion.tipo) {
      case 'ocupado':
        return { admitido: true, conteo: ocupacion.conteo };
      case 'aforo_superado':
        return { admitido: false, motivo: 'AFORO_SUPERADO' };
      default:
        return { admitido: false, motivo: 'FALLO_TECNICO' };
    }
  }
}

/**
 * Caso de uso `ReiniciarAforosVencidos` — **D-36**, la mitad que faltaba.
 *
 * `ValidarAforo` ya reinicia el contador cuando alguien entra, y hasta la ETAPA
 * 14 eso era todo: el reinicio se PROYECTABA al leer y se persistía al ocupar.
 * La consecuencia, escrita sin rodeos: **una zona que nadie toca conserva su
 * conteo antiguo indefinidamente**. El gimnasio cerró con dieciocho personas
 * dentro, nadie vuelve a entrar en tres días, y durante esos tres días la
 * consola y cualquier consulta de aforo dicen dieciocho. No es un error de
 * cálculo —la proyección es correcta— es que nadie la escribe.
 *
 * Esto lo ejecuta un trabajo programado cada hora, y es idempotente por
 * construcción: `debeReiniciarAforo` es falso en cuanto `ultimoReinicio` es
 * posterior al último cierre de jornada, así que la segunda pasada de la misma
 * hora no hace nada. Esa propiedad es la que permite que pg-boss reintente.
 *
 * Las zonas con política `manual` o `nunca` no se tocan: la decisión sigue
 * siendo del dominio, aquí solo se le pregunta por cada zona.
 */
export interface ParteDeReinicio {
  readonly zonas: number;
  readonly reiniciadas: number;
}

export class ReiniciarAforosVencidos {
  constructor(
    private readonly repositorio: RepositorioZonas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(copropiedadId: string): Promise<ParteDeReinicio> {
    const ahora = this.reloj.ahora();
    const zonas = await this.repositorio.listar(copropiedadId);
    let reiniciadas = 0;
    for (const zona of zonas) {
      if (
        !debeReiniciarAforo({
          politica: zona.politicaReinicio,
          horario: zona.horario,
          ultimoReinicio: zona.ultimoReinicio,
          ahora,
        })
      ) {
        continue;
      }
      await this.repositorio.reiniciar(copropiedadId, zona.id, ahora);
      reiniciadas += 1;
    }
    return { zonas: zonas.length, reiniciadas };
  }
}

/**
 * Caso de uso `LiberarAforo` — la salida. Devuelve el conteo resultante para
 * que la consola lo pinte sin una segunda consulta.
 */
export class LiberarAforo {
  constructor(private readonly repositorio: RepositorioZonas) {}

  async ejecutar(copropiedadId: string, zonaId: string): Promise<number> {
    return this.repositorio.liberar(copropiedadId, zonaId);
  }
}

/** Caso de uso `ConfigurarZona` — HU-18, mockup W-06. */
export class ConfigurarZona {
  constructor(private readonly repositorio: RepositorioZonas) {}

  async ejecutar(
    copropiedadId: string,
    zonaId: string,
    actorId: string,
    cambios: {
      nombre?: string;
      horario?: HorarioDeZona;
      aforo?: Aforo;
      politicaReinicio?: PoliticaReinicio;
      normas?: readonly string[];
      controladores?: readonly string[];
      abierta?: boolean;
    },
  ): Promise<Resultado<Zona, ErrorDominio>> {
    const zona = await this.repositorio.porId(copropiedadId, zonaId);
    if (zona === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La zona no existe en esta copropiedad'));
    }

    const reconfigurada = zona.reconfigurar(cambios);
    if (esFallo(reconfigurada)) return reconfigurada;

    const conApertura =
      cambios.abierta === undefined
        ? reconfigurada.valor
        : reconfigurada.valor.cambiarApertura(cambios.abierta);

    await this.repositorio.guardar(conApertura, actorId);
    return exito(conApertura);
  }
}

/**
 * Caso de uso `AutorizarZonaAVisitante` — HU-19, HU-20.
 *
 * No decide si el visitante entra: **da permiso sobre la zona**, que es una de
 * las tres condiciones que el motor evalúa por separado. Que exista el permiso
 * no dice nada sobre el horario ni sobre el aforo, y esa separación es lo que
 * permite que el evento diga cuál de las tres falló.
 */
export class AutorizarZonaAVisitante {
  constructor(
    private readonly zonas: RepositorioZonas,
    private readonly permisos: RepositorioAutorizacionesZona,
  ) {}

  async ejecutar(
    copropiedadId: string,
    autorizacionId: string,
    zonaId: string,
    actorId: string,
  ): Promise<Resultado<{ zonaId: string }, ErrorDominio>> {
    const zona = await this.zonas.porId(copropiedadId, zonaId);
    if (zona === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La zona no existe en esta copropiedad'));
    }

    const otorgado = await this.permisos.autorizar(copropiedadId, autorizacionId, zonaId, actorId);
    if (!otorgado) {
      // Idempotente: conceder dos veces el mismo permiso no es un error del
      // administrador, y devolver 409 le haría creer que algo falló.
      return exito({ zonaId });
    }
    return exito({ zonaId });
  }
}
