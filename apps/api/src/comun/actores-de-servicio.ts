/**
 * LAS IDENTIDADES DE SERVICIO, Y POR QUÉ ESTÁN AQUÍ Y NO EN UN CONTROLADOR.
 *
 * Un evento tiene `creado_por NOT NULL`: alguien lo registró. Cuando el emisor
 * es una cámara no hay usuario, y atribuirlo al último administrador que tocó
 * el sistema sería falsear la auditoría. Se usan identidades fijas y declaradas.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EN `comun` (ETAPA 15)
 *
 * Desde esta etapa hay **dos** receptores de equipo —la ingesta firmada, que
 * usan el Edge y cualquier emisor capaz de firmar, y el receptor del «servidor
 * de alarma», al que la cámara publica sin firmar— y los dos atribuyen al mismo
 * actor. Dos constantes iguales escritas en dos sitios se separan, y entonces
 * el histórico atribuye el mismo tipo de hecho a dos identidades distintas sin
 * que nadie lo note hasta auditar.
 *
 * Y tiene que vivir en fontanería, no en el barril de un módulo: exportarla
 * desde `autorizaciones/index.ts` creaba un CICLO —el barril cargaba su
 * controlador, el controlador cargaba `eventos`, y `eventos` vuelve al
 * barril—. Nest lo manifiesta como «can't resolve dependencies … Function»,
 * que es el nombre que recibe un símbolo todavía sin evaluar.
 */

/**
 * Emisores de hardware: cámaras, terminales y gateways; y el enlace por el que
 * el titular responde su consentimiento sin sesión (15-E, A3).
 *
 * Es `app.actor_de_ingesta()` de la migración 0035. Hasta la 15-E valía
 * `…0002`, que es el superadministrador de DEMOSTRACIÓN del seed: en una base
 * con sólo migraciones no existía —la primera escritura de una cámara habría
 * fallado por la clave ajena a `usuarios`— y en la de demostración firmaba lo
 * de las cámaras con un humano. Ninguna de las dos cosas es una auditoría.
 */
export const ACTOR_INGESTA = '00000000-0000-4000-8000-000000000003';
