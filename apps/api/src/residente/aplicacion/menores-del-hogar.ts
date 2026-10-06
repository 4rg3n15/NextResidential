import { Inject, Injectable } from '@nestjs/common';
import {
  MENSAJE_MAYOR_SIN_CUENTA,
  RELOJ,
  edadEn,
  formatearCodigoDeOcupante,
  normalizarDocumento,
  puedeTenerCuenta,
} from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { SuprimirPlantillasDeTitular } from '../../biometria';
import type { ResolverMiAmbito } from './casos-de-uso';
import { OCUPANTES_DE_LA_VIVIENDA } from './puertos-hogar';
import type { CodigosDeOcupante, OcupantesDeLaVivienda } from './puertos-hogar';
import { MENORES_DEL_HOGAR } from './puertos-de-menores';
import type {
  AltaDeMenor,
  DatosDelMenor,
  MenorEscrito,
  MenoresDelHogar,
} from './puertos-de-menores';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS MENORES DEL HOGAR · RONDA 15-W (D-W2, D4, ADR-038)
 *
 * Cualquier adulto con cuenta de la vivienda los ve, registra, edita y da de
 * baja; la vivienda sale del ámbito del token. La edad la decide el dominio con
 * el reloj inyectado: una persona de 18 o más no se registra como menor —crea
 * su cuenta con un código de plaza—, y una fecha editada no puede volverla
 * mayor sin pasar por ahí. La base lo repite: sin cuenta sólo ocupa plaza un
 * menor (`plazas_persona_menor`, 0056).
 *
 * El CÓDIGO DE TRASPASO (S-15W-05) es para quien YA cumplió 18: con él crea su
 * cuenta y reclama la MISMA persona, con su historial. Sólo lo pide el titular.
 * El documento sale siempre enmascarado.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const TRASPASOS = Symbol('TRASPASOS');

export interface MenorVisible {
  readonly residenteId: string;
  readonly nombres: string | null;
  readonly apellidos: string | null;
  readonly nombreCompleto: string;
  readonly fechaNacimiento: string | null;
  readonly edad: number | null;
  readonly tipoDocumento: string;
  /** «••••5678»: el número entero no sale hacia la app. */
  readonly documento: string;
  readonly parentesco: string | null;
  readonly plazaId: string | null;
  readonly plazaNumero: number | null;
  readonly tieneRostro: boolean;
}

export type ResultadoDeMenor =
  | { readonly hecho: true; readonly residenteId: string; readonly codigo?: string }
  | { readonly hecho: false; readonly estado: 400 | 403 | 404 | 409; readonly explicacion: string };

const enmascarar = (numero: string): string => `••••${numero.slice(-4)}`;
const no = (estado: 400 | 403 | 404 | 409, explicacion: string): ResultadoDeMenor => ({
  hecho: false,
  estado,
  explicacion,
});
const traducir = (r: MenorEscrito): ResultadoDeMenor => {
  if (r.ok) return { hecho: true, residenteId: r.residenteId };
  if (r.motivo === 'NO_ENCONTRADO') return no(404, 'No encontrado en su vivienda');
  if (r.motivo === 'PLAZA_OCUPADA') return no(409, 'Esa plaza ya está ocupada');
  return no(409, 'Ese documento ya pertenece a otra persona o a otra vivienda');
};

@Injectable()
export class MenoresDeMiHogar {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(MENORES_DEL_HOGAR) private readonly menores: MenoresDelHogar,
    @Inject(OCUPANTES_DE_LA_VIVIENDA) private readonly ocupantes: OcupantesDeLaVivienda,
    @Inject(TRASPASOS) private readonly traspasos: CodigosDeOcupante,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly suprimirPlantillas: SuprimirPlantillasDeTitular | null = null,
  ) {}

  async listar(
    ctx: ContextoTenant,
    cop: string,
  ): Promise<Resultado<readonly MenorVisible[], ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, cop);
    if (!r.ok) return r;
    const ahora = this.reloj.ahora();
    const lista = await this.menores.listar(cop, r.valor.ambito.viviendaId);
    return {
      ok: true,
      valor: lista.map(({ numeroDocumento, ...m }) => ({
        ...m,
        documento: enmascarar(numeroDocumento),
        edad: m.fechaNacimiento === null ? null : edadEn(m.fechaNacimiento, ahora),
      })),
    };
  }

  async registrar(
    ctx: ContextoTenant,
    cop: string,
    alta: AltaDeMenor,
  ): Promise<Resultado<ResultadoDeMenor, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, cop);
    if (!r.ok) return r;
    const rechazo = this.rechazoPorEdad(alta.fechaNacimiento);
    if (rechazo !== null) return { ok: true, valor: rechazo };
    const numero = normalizarDocumento(alta.numeroDocumento);
    if (!/^[A-Z0-9]{4,20}$/.test(numero)) {
      return { ok: true, valor: no(400, 'El documento tiene de 4 a 20 letras o cifras') };
    }
    const hecho = await this.menores.registrar(cop, r.valor.ambito.viviendaId, ctx.usuarioId, {
      ...alta,
      numeroDocumento: numero,
    });
    return { ok: true, valor: traducir(hecho) };
  }

  async editar(
    ctx: ContextoTenant,
    cop: string,
    residenteId: string,
    datos: DatosDelMenor,
  ): Promise<Resultado<ResultadoDeMenor, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, cop);
    if (!r.ok) return r;
    const rechazo = this.rechazoPorEdad(datos.fechaNacimiento);
    if (rechazo !== null) return { ok: true, valor: rechazo };
    const hecho = await this.menores.editar(
      cop,
      r.valor.ambito.viviendaId,
      residenteId,
      ctx.usuarioId,
      datos,
    );
    return { ok: true, valor: traducir(hecho) };
  }

  /** Baja con motivo: su plaza queda libre y sus plantillas, suprimidas (RN-11). */
  async darDeBaja(
    ctx: ContextoTenant,
    cop: string,
    residenteId: string,
    motivo: string,
  ): Promise<Resultado<ResultadoDeMenor, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, cop);
    if (!r.ok) return r;
    const hecho = await this.menores.darDeBaja(
      cop,
      r.valor.ambito.viviendaId,
      residenteId,
      ctx.usuarioId,
      motivo,
    );
    if (hecho.ok && this.suprimirPlantillas !== null) {
      await this.suprimirPlantillas.ejecutar(ctx, cop, hecho.personaId);
    }
    return { ok: true, valor: traducir(hecho) };
  }

  /** S-15W-05 · sólo el titular, y sólo para quien ya cumplió 18. */
  async codigoDeTraspaso(
    ctx: ContextoTenant,
    cop: string,
    residenteId: string,
  ): Promise<Resultado<ResultadoDeMenor, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, cop);
    if (!r.ok) return r;
    const { viviendaId } = r.valor.ambito;
    const d = await this.ocupantes.declaracion(cop, viviendaId, ctx.usuarioId);
    if (!d.esPrimerResidente) {
      return { ok: true, valor: no(403, 'Sólo el titular genera el código de traspaso') };
    }
    const plaza = await this.menores.plazaParaTraspaso(cop, viviendaId, residenteId);
    if (plaza === null) return { ok: true, valor: no(404, 'No encontrado en su vivienda') };
    const edad =
      plaza.fechaNacimiento === null ? null : edadEn(plaza.fechaNacimiento, this.reloj.ahora());
    if (edad === null || !puedeTenerCuenta(edad)) {
      return { ok: true, valor: no(409, 'El código de traspaso es para quien ya cumplió 18 años') };
    }
    const codigo = formatearCodigoDeOcupante(
      this.traspasos.codigoDe(cop, plaza.plazaId, plaza.generacion),
      d.codigoCorto,
    );
    return { ok: true, valor: { hecho: true, residenteId, codigo } };
  }

  private rechazoPorEdad(fecha: string): ResultadoDeMenor | null {
    const edad = edadEn(fecha, this.reloj.ahora());
    if (edad === null) return no(400, 'Fecha de nacimiento no válida');
    return puedeTenerCuenta(edad) ? no(400, MENSAJE_MAYOR_SIN_CUENTA) : null;
  }
}
