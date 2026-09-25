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

  /**
   * ETAPA 15-E (A3) · la respuesta del TITULAR por su enlace (RN-10, Ley 1581):
   * qué contestó, a qué versión de la política, desde dónde y cuándo. Es la
   * evidencia de la aceptación —o del rechazo, o de la revocación— y va a la
   * tabla append-only, no a un log que rota.
   */
  registrarRespuestaDeTitular(entrada: {
    copropiedadId: string;
    consentimientoId: string;
    respuesta: 'aceptado' | 'rechazado' | 'revocado';
    versionPolitica: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void>;
}

export type RespuestaDeTitularAuditada = Parameters<
  RegistroDeAuditoria['registrarRespuestaDeTitular']
>[0];

export const REGISTRO_AUDITORIA = Symbol.for('ncr.puerto.RegistroDeAuditoria');
