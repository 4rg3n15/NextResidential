/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UNA CUENTA DE RESIDENTE NACE CON SU VIVIENDA · RONDA 15-W (D-W1, D-W9, ADR-037)
 *
 * La del titular, asignada por la administración (D1); las demás, atadas a la
 * plaza cuyo código se usó en «Crear cuenta» (D2). La cuenta y su vínculo van
 * en UNA transacción de base: si el vínculo no se puede escribir —otro tomó la
 * plaza, la vivienda ya tiene titular—, la cuenta tampoco existe, y la del
 * proveedor de identidad se borra con la compensación de siempre.
 *
 * Cuentas no sabe qué es una plaza ni una vivienda, y no debe saberlo: el
 * módulo del residente depende de cuentas, no al revés. Así que cuentas declara
 * dos puertos y el residente los cumple (DIP, §2.3):
 *
 *  · `EscrituraDelVinculo` — lo que se escribe DENTRO de la transacción de la
 *    cuenta, con el ejecutor de ESA transacción. La arma el residente; cuentas
 *    sólo la ejecuta entre su INSERT y su COMMIT.
 *  · `InvitacionesDeResidente` — lo que «Crear cuenta» pregunta del código. Se
 *    INSCRIBE al arrancar, como el gancho de sesión de portería: sin
 *    inscripción, el registro no está disponible (falla cerrado).
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Una sentencia parametrizada dentro de la transacción del alta: filas afectadas. */
export type EjecutorDelAlta = (sql: string, parametros: readonly unknown[]) => Promise<number>;

export interface EscrituraDelVinculo {
  /** `false` = la base dijo que no (carrera): se deshace el alta ENTERA. */
  escribir(ejecutar: EjecutorDelAlta, usuarioId: string): Promise<boolean>;
}

/** Lo que el registro sabe de quien se registra y el vínculo necesita guardar. */
export interface DatosDelRegistro {
  /** `AAAA-MM-DD`, ya comprobada mayor de edad. */
  readonly fechaNacimiento: string;
  /** Contacto NO verificado: va a `personas.correo`, nunca a `usuarios.correo`. */
  readonly correo: string;
  readonly versionPolitica: string;
}

export interface InvitacionesDeResidente {
  /** §7 · ¿está suspendido el registro de esa copropiedad por códigos fallidos? */
  suspendido(copropiedadId: string, ahora: Date): Promise<boolean>;
  /**
   * El código, SÓLO dentro de esa copropiedad y SÓLO contra plazas libres (o la
   * de una persona ya mayor de edad, para su traspaso), en tiempo constante. Con
   * `copropiedadId` nulo, una comparación ficticia del mismo coste: el tiempo no
   * dice qué conjuntos existen. `null` = ningún código coincide.
   */
  resolver(
    copropiedadId: string | null,
    codigo: string,
    datos: DatosDelRegistro,
  ): Promise<EscrituraDelVinculo | null>;
  /** Anota el fallo con un HMAC de la IP —nunca la IP— y suspende si se llegó al tope. */
  anotarFallo(copropiedadId: string, ip: string | null, ahora: Date): Promise<void>;
}

export interface RegistroDeInvitaciones {
  inscribir(invitaciones: InvitacionesDeResidente): void;
  actual(): InvitacionesDeResidente | null;
}
export const REGISTRO_DE_INVITACIONES = Symbol.for('ncr.puerto.RegistroDeInvitaciones');

/** El registro de una sola plaza: el residente se inscribe una vez al arrancar. */
export class RegistroUnicoDeInvitaciones implements RegistroDeInvitaciones {
  private inscritas: InvitacionesDeResidente | null = null;

  inscribir(invitaciones: InvitacionesDeResidente): void {
    if (this.inscritas !== null) throw new Error('invitaciones de residente inscritas dos veces');
    this.inscritas = invitaciones;
  }

  actual(): InvitacionesDeResidente | null {
    return this.inscritas;
  }
}
