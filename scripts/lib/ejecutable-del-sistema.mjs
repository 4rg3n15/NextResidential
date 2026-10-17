/**
 * Cómo se llama un ejecutable en cada sistema.
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
