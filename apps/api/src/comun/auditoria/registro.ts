/**
 * Puerto de auditoría de seguridad, en la fontanería compartida.
 *
 * **Por qué vive aquí y no en `multiempresa`.** Lo necesitan dos módulos:
 * `multiempresa` para registrar los accesos cruzados (RN-15, CA-24) y
 * `autenticacion` para registrar el restablecimiento de la propia contraseña
 * (§2.7.8). Mientras el token y su adaptador vivieron dentro de `multiempresa`,
 * que `autenticacion` lo alcanzara dependía de que un proveedor `@Global()`
 * llegara a tiempo, y **no llegaba**: en producción el proceso no arrancaba con
 *
 *   Nest can't resolve dependencies of the AutenticacionController (?, …)
 *
 * mientras las 363 pruebas seguían en verde, porque `Test.createTestingModule`
 * envuelve `AppModule` en un módulo raíz propio y allí los globales alcanzan a
 * todo. El arnés de pruebas cubría un grafo de módulos que el proceso real no
 * podía construir.
 *
 * Un puerto que dos módulos comparten no pertenece a ninguno de los dos:
 * pertenece al núcleo. `NucleoModule` lo provee, se registra primero y no
 * depende de nadie, así que no hay orden que recordar ni ciclo de `require`
 * —importarlo desde `multiempresa` cerraba uno, porque `aislamiento.ts` toma
 * tipos del barril de `autenticacion`—.
 */
export interface RegistroDeAuditoria {
  registrarAccesoCruzado(entrada: {
    usuarioId: string;
    rol: string;
    copropiedadSolicitada: string;
    recurso: string;
  }): Promise<void>;

  /**
   * Rastro del cambio de credencial (migración 0023, §2.7.8).
   *
   * Método propio y no uno genérico `registrar(tipo, ...)`: cada evento de
   * seguridad tiene su forma, y un método que acepta cualquier tipo acaba
   * recibiendo cadenas libres que nadie puede filtrar después.
   */
  registrarRestablecimiento(entrada: {
    usuarioId: string;
    rol: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void>;
}

export const REGISTRO_AUDITORIA = Symbol.for('ncr.puerto.RegistroDeAuditoria');
