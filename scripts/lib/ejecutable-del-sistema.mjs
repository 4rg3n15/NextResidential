/**
 * Cómo se llama —y cómo se invoca— un ejecutable en cada sistema.
 *
 * POR QUÉ EXISTE (D-66, reportado desde el despliegue en Windows). Dos controles
 * del utillaje daban un **falso negativo** en Windows con la herramienta
 * perfectamente instalada:
 *
 *  · `verificar-entorno.mjs` hacía `execFileSync('pnpm', ['--version'])`. En
 *    Windows, `execFileSync` llama a `CreateProcess` **sin aplicar `PATHEXT`**,
 *    así que no encuentra `pnpm.cmd`; y el fichero sin extensión que npm deja
 *    para MSYS es un script de shell que `CreateProcess` no sabe ejecutar.
 *    Resultado: «pnpm no está disponible en el PATH» con pnpm respondiendo
 *    `9.15.0` a dos centímetros. Y como el **paso 1** del verificador ejecuta
 *    `pnpm entorno`, la verificación entera salía FALLIDA en Windows.
 *  · `buscarFfmpeg` recorría el PATH buscando un fichero llamado `ffmpeg`, sin
 *    extensión. En Windows sólo existe `ffmpeg.exe`.
 *
 * Es una sola clase de defecto —el nombre del ejecutable no es portable— y por
 * eso vive en un solo sitio en vez de parcheada dos veces.
 *
 * **Nota sobre el control de portabilidad.** `portabilidad.mjs` vigila las
 * divergencias BSD/GNU porque el desarrollo es macOS y el CI es Linux. Windows
 * es un **tercer caso** que ese control no contempla, y estos dos defectos son
 * su primera consecuencia conocida. Queda registrado como deuda.
 */

/**
 * Los nombres con los que intentar `base`, en orden de preferencia.
 *
 * En Windows se prueba primero `.cmd` —el lanzador que instala npm y el que
 * `CreateProcess` sí ejecuta—, luego `.exe`, y por último el nombre desnudo,
 * que es lo correcto en cualquier sistema POSIX.
 */
export const candidatosDeEjecutable = (base, plataforma = process.platform) =>
  plataforma === 'win32' ? [`${base}.cmd`, `${base}.exe`, base] : [base];

/**
 * ¿Hay que pasar por el shell para ejecutar `nombre`?
 *
 * D-66, SEGUNDA CAPA. Resolver el nombre no bastaba. Desde Node 18.20.2 y
 * 20.12.2 —la mitigación de CVE-2024-27980, «BatBadBut»— Node **se niega** a
 * lanzar un `.cmd` o un `.bat` sin `shell: true`, y `execFileSync('pnpm.cmd')`
 * lanza `EINVAL` en vez de ejecutarlo. El primer arreglo encontraba el nombre
 * correcto y moría igual, un paso más adelante.
 *
 * `shell: true` cambia las reglas de citado, así que **sólo es seguro con
 * argumentos literales**. Aquí lo son (`['--version']`): nada de lo que se pasa
 * viene del entorno ni del usuario. Con argumentos variables habría que volver
 * a `execFile` y resolver el intérprete a mano.
 */
export const necesitaShell = (nombre, plataforma = process.platform) =>
  plataforma === 'win32' && /\.(cmd|bat)$/i.test(nombre);

/**
 * La versión del gestor de paquetes según `npm_config_user_agent`, que npm,
 * pnpm y yarn escriben al ejecutar un guion.
 *
 * Es la vía PREFERIDA sobre lanzar un proceso: no depende del PATH, ni de
 * `PATHEXT`, ni de qué puede ejecutar `CreateProcess`. Cuando esto corre como
 * `pnpm entorno` —que es el caso del paso 1 del verificador— la respuesta ya
 * está en el entorno y no hace falta preguntar a nadie.
 *
 * Formato: `pnpm/9.15.0 npm/? node/v22.22.2 win32 x64`.
 */
export const versionEnAgente = (agente, gestor) => {
  const m = new RegExp(`(?:^|\\s)${gestor}/(\\d+\\.\\d+\\.\\d+[^\\s]*)`).exec(agente ?? '');
  return m?.[1] ?? null;
};
