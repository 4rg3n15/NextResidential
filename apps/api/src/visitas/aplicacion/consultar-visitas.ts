import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { AlmacenDeFotos } from './lector-de-fotos';
import type {
  ConsultaDeVisitas,
  DatosParaRepetir,
  EstadoDeVisita,
  FotoEnEquipo,
  VisitaListada,
  VisitanteReciente,
  ViviendaDeVisita,
} from './puertos';

const sinCopropiedad = (): ErrorDominio =>
  errorDominio('OPERACION_NO_PERMITIDA', 'Sin copropiedad', 'RN-15');

/** Los roles que están en la puerta ven SOLO el día (F5). [SUPUESTO] la central también. */
const SOLO_EL_DIA = new Set(['portero', 'operador_central']);

export interface PeticionDeVisitas {
  readonly desde: Date | null;
  readonly hasta: Date | null;
  readonly viviendaId: string | null;
  readonly estado: EstadoDeVisita | null;
  readonly texto: string | null;
}

export interface ListaDeVisitas {
  /** `true` cuando la lista es la del día, sin importar lo que se pidió. */
  readonly soloElDia: boolean;
  readonly desde: Date | null;
  readonly hasta: Date | null;
  readonly visitas: readonly VisitaListada[];
}

export const LIMITE_DE_LISTA = 200;

/**
 * `ListarVisitas` — F5 y F7 (15-L).
 *
 * Portería ve las visitas de HOY en la zona horaria de la copropiedad, y la
 * lista «se reinicia» sola a medianoche porque el día se calcula en cada
 * lectura: es un FILTRO de vista, no borra nada. El historial completo sigue
 * en la base y lo ve administración con sus filtros (por vivienda, fechas,
 * estado, nombre o documento).
 */
export class ListarVisitas {
  constructor(
    private readonly consulta: ConsultaDeVisitas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    peticion: PeticionDeVisitas,
  ): Promise<Resultado<ListaDeVisitas, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(sinCopropiedad());
    const ahora = this.reloj.ahora();
    const texto = peticion.texto?.trim() === '' ? null : (peticion.texto?.trim() ?? null);

    if (SOLO_EL_DIA.has(ctx.rol)) {
      const dia = await this.consulta.diaDe(copropiedadId, ahora);
      const visitas = await this.consulta.listar(copropiedadId, {
        desde: dia.desde,
        hasta: dia.hasta,
        viviendaId: null,
        estado: null,
        texto,
        ahora,
        limite: LIMITE_DE_LISTA,
      });
      return exito({ soloElDia: true, desde: dia.desde, hasta: dia.hasta, visitas });
    }

    const visitas = await this.consulta.listar(copropiedadId, {
      ...peticion,
      texto,
      ahora,
      limite: LIMITE_DE_LISTA,
    });
    return exito({ soloElDia: false, desde: peticion.desde, hasta: peticion.hasta, visitas });
  }
}

/** F3 · en qué equipos está (o estuvo) la foto de una visita. */
export class FotoDeVisitaEnEquipos {
  constructor(private readonly consulta: ConsultaDeVisitas) {}

  async ejecutar(
    ctx: ContextoTenant,
    autorizacionId: string,
  ): Promise<Resultado<readonly FotoEnEquipo[], ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(sinCopropiedad());
    const visita = await this.consulta.porId(copropiedadId, autorizacionId, new Date());
    if (visita === null) {
      return fallo(
        errorDominio('ENTIDAD_NO_ENCONTRADA', 'La visita no existe en esta copropiedad'),
      );
    }
    return exito(await this.consulta.fotoEnEquipos(copropiedadId, autorizacionId));
  }
}

/** F1 · las viviendas para elegir en el formulario, para todos los roles de la consola. */
export class ViviendasParaVisitas {
  constructor(private readonly consulta: ConsultaDeVisitas) {}

  async ejecutar(
    ctx: ContextoTenant,
  ): Promise<Resultado<readonly ViviendaDeVisita[], ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(sinCopropiedad());
    return exito(await this.consulta.viviendas(copropiedadId));
  }
}

/**
 * F6 · «Últimos visitantes» de UNA vivienda. Quien llama pone la vivienda —el
 * módulo del residente, desde su vínculo—; aquí no se decide cuál.
 */
export class UltimosVisitantes {
  constructor(private readonly consulta: ConsultaDeVisitas) {}

  ejecutar(
    copropiedadId: string,
    viviendaId: string,
    limite = 20,
  ): Promise<readonly VisitanteReciente[]> {
    return this.consulta.ultimosDeVivienda(copropiedadId, viviendaId, Math.min(limite, 50));
  }
}

export interface Repeticion extends DatosParaRepetir {
  readonly foto: { readonly contenidoBase64: string; readonly tipoMime: string } | null;
}

/**
 * F6 · «Volver a autorizar»: los datos y la foto de una visita anterior de ESA
 * vivienda. Si la visita es de otra vivienda, no existe (RN-15): la consulta
 * no la encuentra, no hay un `if` de permiso que olvidar.
 */
export class DatosParaVolverAAutorizar {
  constructor(
    private readonly consulta: ConsultaDeVisitas,
    private readonly fotos: AlmacenDeFotos,
  ) {}

  async ejecutar(
    copropiedadId: string,
    viviendaId: string,
    autorizacionId: string,
  ): Promise<Resultado<Repeticion, ErrorDominio>> {
    const datos = await this.consulta.paraRepetir(copropiedadId, viviendaId, autorizacionId);
    if (datos === null) {
      return fallo(
        errorDominio('ENTIDAD_NO_ENCONTRADA', 'Esa visita no es de su vivienda', 'RN-15'),
      );
    }
    const foto = await this.fotos.deLaAutorizacion(copropiedadId, autorizacionId);
    return exito({ ...datos, foto });
  }
}
