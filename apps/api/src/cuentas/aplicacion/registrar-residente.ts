import {
  edadEn,
  exito,
  fallo,
  normalizarCodigoDeOcupante,
  puedeTenerCuenta,
} from '@ncr/domain-core';
import type { Reloj, Resultado } from '@ncr/domain-core';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { nombreDeUsuario } from '../dominio/nombre-de-usuario';
import { motivoDeRechazoDeContrasena } from '../dominio/politica-de-contrasena';
import type { CrearCuentaPorUsuario } from './crear-cuenta';
import type { IgualadorDeTiempo, RepositorioDeCuentas } from './puertos';
import type { RegistroDeInvitaciones } from './puertos-del-registro';
import { VERSION_DE_LA_POLITICA_DE_DATOS } from './politica-de-datos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * «CREAR CUENTA» CON CÓDIGO DE INVITACIÓN · RONDA 15-W (D-W1, D-W8, D2, ADR-037)
 *
 * Una persona mayor de edad crea SU cuenta con el código de una plaza libre que
 * el titular de su vivienda le compartió. Nunca sale de aquí un titular: el
 * código sólo se busca entre plazas que ya existen en una vivienda que ya tiene
 * titular (lo crea la administración, D1), y la cuenta queda atada a ESA plaza
 * en la misma transacción en que nace.
 *
 * El orden es el del encargo, y cada paso tiene su porqué:
 *  1 · la FORMA de todo, antes de tocar la base: los campos vacíos, el formato
 *      del usuario, la política de contraseña y la confirmación se contestan
 *      campo a campo, y no dicen nada de ningún conjunto;
 *  2 · la edad, con el reloj inyectado y el día de Bogotá: un menor no crea
 *      nada, ni en el proveedor de identidad ni en la base. Va ANTES que el
 *      prefijo —el encargo la ponía después de la suspensión—: así un menor
 *      recibe la misma respuesta exista o no el conjunto, y la edad no sirve
 *      para enumerar códigos cortos ni para saber qué registro está suspendido;
 *  3 · el prefijo del código resuelve la copropiedad por su código corto; si
 *      no existe, se hace una comparación FICTICIA del mismo coste;
 *  4 · un registro suspendido por intentos (§7) contesta como un código malo;
 *  5 · el código, en tiempo constante, SÓLO dentro de esa copropiedad;
 *  6 · la cuenta, con el vínculo en su transacción. Si otra alta se llevó la
 *      plaza en el mismo instante, 409 y la identidad sobrante se elimina.
 *
 * Código incorrecto, usado, de otro conjunto o con el registro suspendido: la
 * MISMA respuesta y el MISMO tiempo mínimo. El fallo cuenta para la suspensión
 * de su copropiedad con un HMAC de la IP: nunca la IP en claro. No emite
 * tokens: la app entra después por `POST /auth/acceso`.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Más que lo que tarda el camino más largo de un fallo, con margen (ADR-023). */
export const TIEMPO_MINIMO_DE_REGISTRO_FALLIDO_MS = 500;

export interface SolicitudDeRegistro {
  readonly usuario: string;
  readonly correo: string;
  readonly contrasena: string;
  readonly confirmacion: string;
  readonly codigoDeInvitacion: string;
  readonly fechaNacimiento: string;
  readonly versionPolitica: string;
}

export interface CampoDelRegistro {
  readonly campo: keyof SolicitudDeRegistro;
  readonly motivo: string;
}

export type RechazoDeRegistro =
  | { readonly motivo: 'CAMPOS'; readonly campos: readonly CampoDelRegistro[] }
  | { readonly motivo: 'MENOR_DE_EDAD' }
  /** Incorrecto, usado, de otro conjunto o con el registro suspendido: indistinguibles. */
  | { readonly motivo: 'CODIGO' }
  /** El código era bueno, pero otra alta simultánea se llevó la plaza. */
  | { readonly motivo: 'CODIGO_EN_USO' }
  | { readonly motivo: 'USUARIO_OCUPADO' }
  | { readonly motivo: 'NO_DISPONIBLE' };

const formaDe = (s: SolicitudDeRegistro): CampoDelRegistro[] => {
  const campos: CampoDelRegistro[] = [];
  const usuario = nombreDeUsuario(s.usuario);
  if (!usuario.ok) campos.push({ campo: 'usuario', motivo: usuario.error });
  const politica = motivoDeRechazoDeContrasena(s.contrasena);
  if (politica !== null) campos.push({ campo: 'contrasena', motivo: politica });
  if (s.confirmacion !== s.contrasena) {
    campos.push({ campo: 'confirmacion', motivo: 'Las contraseñas no coinciden' });
  }
  if (s.versionPolitica !== VERSION_DE_LA_POLITICA_DE_DATOS) {
    campos.push({
      campo: 'versionPolitica',
      motivo: 'La política de tratamiento de datos cambió: léala y acéptela de nuevo',
    });
  }
  return campos;
};

export class RegistrarResidente {
  constructor(
    private readonly crearCuenta: CrearCuentaPorUsuario,
    private readonly cuentas: RepositorioDeCuentas,
    private readonly invitaciones: RegistroDeInvitaciones,
    private readonly tiempo: IgualadorDeTiempo,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    s: SolicitudDeRegistro,
    ip: string | null,
  ): Promise<Resultado<{ readonly creada: true }, RechazoDeRegistro>> {
    const inicio = this.tiempo.ahoraMs();
    const invitaciones = this.invitaciones.actual();
    if (invitaciones === null) return fallo({ motivo: 'NO_DISPONIBLE' });
    const igualado = async <T>(r: T): Promise<T> => {
      await this.tiempo.esperarHasta(inicio, TIEMPO_MINIMO_DE_REGISTRO_FALLIDO_MS);
      return r;
    };

    // 1 · forma.
    const campos = formaDe(s);
    const edad = edadEn(s.fechaNacimiento, this.reloj.ahora());
    if (edad === null) campos.push({ campo: 'fechaNacimiento', motivo: 'Fecha no válida' });
    if (campos.length > 0) return fallo({ motivo: 'CAMPOS', campos });

    // 2 · la edad: un menor no crea nada, y lo sabe sin que se mire el código.
    if (edad === null || !puedeTenerCuenta(edad)) return fallo({ motivo: 'MENOR_DE_EDAD' });

    // 3 · el prefijo; sin él, o sin conjunto, el coste de una búsqueda de verdad.
    const codigo = normalizarCodigoDeOcupante(s.codigoDeInvitacion);
    const prefijo = codigo.ok ? codigo.valor.prefijo : null;
    const copropiedadId =
      prefijo === null ? null : await this.cuentas.copropiedadPorCodigo(prefijo);
    const datos = {
      fechaNacimiento: s.fechaNacimiento,
      // Contacto no verificado (S-15W-04): se guarda normalizado, nunca para entrar.
      correo: s.correo.trim().toLowerCase(),
      versionPolitica: s.versionPolitica,
    };
    if (!codigo.ok || copropiedadId === null) {
      await invitaciones.resolver(null, codigo.ok ? codigo.valor.codigo : '', datos);
      return igualado(fallo({ motivo: 'CODIGO' }));
    }

    // 4 · suspendido: como un código malo, y sin contarlo (no se evaluó).
    const ahora = this.reloj.ahora();
    if (await invitaciones.suspendido(copropiedadId, ahora)) {
      return igualado(fallo({ motivo: 'CODIGO' }));
    }

    // 5 · el código, sólo en esa copropiedad.
    const escritura = await invitaciones.resolver(copropiedadId, codigo.valor.codigo, datos);
    if (escritura === null) {
      await invitaciones.anotarFallo(copropiedadId, ip, ahora);
      return igualado(fallo({ motivo: 'CODIGO' }));
    }

    // 6 · la cuenta y su vínculo, juntos.
    const r = await this.crearCuenta.ejecutarConVinculo(
      {
        copropiedadId,
        usuario: s.usuario,
        nombre: s.usuario,
        telefono: null,
        rol: 'residente',
        contrasenaInicial: s.contrasena,
        origen: 'autorregistro',
        debeCambiarContrasena: false,
      },
      escritura,
      ACTOR_INGESTA,
    );
    if (r.ok) return exito({ creada: true });
    if (r.error.motivo === 'DUPLICADO') return fallo({ motivo: 'USUARIO_OCUPADO' });
    if (r.error.motivo === 'VINCULO') return fallo({ motivo: 'CODIGO_EN_USO' });
    if (r.error.motivo === 'FORMATO') {
      return fallo({ motivo: 'CAMPOS', campos: [{ campo: 'usuario', motivo: r.error.detalle }] });
    }
    return fallo({ motivo: 'NO_DISPONIBLE' });
  }
}
