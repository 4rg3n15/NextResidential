import { describe, expect, it } from 'vitest';
import {
  candidatosDeEjecutable,
  necesitaShell,
  nombreDeBinarioNativo,
  versionEnAgente,
} from '../../../scripts/lib/ejecutable-del-sistema.mjs';
import { buscarFfmpeg } from '../../../scripts/lib/transcodificacion-del-puente.mjs';

/**
 * D-66 · EL NOMBRE DE UN EJECUTABLE NO ES PORTABLE
 *
 * Reportado desde el despliegue en un equipo Windows: dos controles del
 * utillaje daban **falso negativo** con la herramienta instalada.
 *
 *  · `pnpm entorno` decía «pnpm no está disponible en el PATH» con pnpm
 *    respondiendo `9.15.0`. `execFileSync` en Windows llama a `CreateProcess`
 *    sin aplicar `PATHEXT`: no ve `pnpm.cmd`, y el fichero sin extensión que
 *    npm deja para MSYS es un script de shell que no sabe ejecutar. Como el
 *    **paso 1** del verificador ejecuta `pnpm entorno`, la verificación entera
 *    salía FALLIDA en Windows aunque todo lo demás estuviera bien.
 *  · `buscarFfmpeg` recorría el PATH buscando `ffmpeg` sin extensión, y en
 *    Windows sólo existe `ffmpeg.exe`.
 *
 * Estas pruebas corren en macOS y en Linux, donde no hay `.exe` ni `.cmd`: la
 * plataforma se **inyecta**. Sin esa inyección, la comprobación del caso que
 * motivó la corrección sería imposible de escribir fuera de Windows — y
 * entonces el defecto habría vuelto sin que nadie lo notara.
 */
describe('candidatosDeEjecutable', () => {
  it('en Windows prueba .cmd y .exe antes que el nombre desnudo', () => {
    // El orden importa: `.cmd` es el lanzador que instala npm y el que
    // `CreateProcess` sí ejecuta. El nombre desnudo va el último porque en
    // Windows suele ser el script de MSYS, que no es ejecutable.
    expect(candidatosDeEjecutable('pnpm', 'win32')).toEqual(['pnpm.cmd', 'pnpm.exe', 'pnpm']);
  });

  it('fuera de Windows no inventa extensiones', () => {
    for (const plataforma of ['darwin', 'linux'] as const) {
      expect(candidatosDeEjecutable('pnpm', plataforma)).toEqual(['pnpm']);
    }
  });
});

describe('buscarFfmpeg y la extensión de Windows', () => {
  const soloExe = (ruta: string) => ruta.endsWith('ffmpeg.exe');
  const soloDesnudo = (ruta: string) => ruta.endsWith('ffmpeg');

  it('encuentra ffmpeg.exe en Windows: el caso que daba «no está en el PATH»', () => {
    const encontrado = buscarFfmpeg('C:\\ffmpeg\\bin', soloExe, 'win32');
    expect(encontrado).not.toBeNull();
    expect(encontrado).toMatch(/ffmpeg\.exe$/);
  });

  it('y la comprobación anterior NO lo habría encontrado', () => {
    // La prueba negativa del propio arreglo: con la plataforma POSIX, el mismo
    // PATH que sólo tiene `ffmpeg.exe` sigue dando `null`. Si alguien
    // revirtiera la corrección, la prueba de arriba pasaría a fallar.
    expect(buscarFfmpeg('C:\\ffmpeg\\bin', soloExe, 'linux')).toBeNull();
  });

  it('en POSIX sigue encontrando el nombre desnudo, sin cambio de comportamiento', () => {
    expect(buscarFfmpeg(['/opt/a', '', '/opt/b'].join(':'), soloDesnudo, 'linux')).toBe(
      '/opt/a/ffmpeg',
    );
    expect(buscarFfmpeg(undefined, soloDesnudo, 'linux')).toBeNull();
  });

  it('un PATH vacío no revienta en ninguna plataforma', () => {
    expect(buscarFfmpeg('', soloExe, 'win32')).toBeNull();
  });
});

/**
 * D-66, SEGUNDA CAPA · resolver el nombre no bastaba.
 *
 * El primer arreglo encontraba `pnpm.cmd` y moría un paso más adelante: desde
 * la mitigación de CVE-2024-27980 («BatBadBut», Node 18.20.2 / 20.12.2), Node
 * se NIEGA a lanzar un `.cmd` o un `.bat` sin `shell: true` y contesta `EINVAL`.
 * El síntoma en el equipo del usuario fue idéntico al anterior —«pnpm no está
 * disponible en el PATH»— por una causa distinta, que es justo lo que hace que
 * este tipo de defecto cueste dos rondas en vez de una.
 */
describe('necesitaShell', () => {
  it('un .cmd o un .bat en Windows exigen shell', () => {
    expect(necesitaShell('pnpm.cmd', 'win32')).toBe(true);
    expect(necesitaShell('algo.BAT', 'win32')).toBe(true);
  });

  it('un .exe no, y en POSIX nada lo exige', () => {
    // El `.exe` se lanza directamente: la mitigación es sólo para los
    // intérpretes de lotes, que son los que reinterpretan el citado.
    expect(necesitaShell('ffmpeg.exe', 'win32')).toBe(false);
    expect(necesitaShell('pnpm.cmd', 'linux')).toBe(false);
    expect(necesitaShell('pnpm', 'darwin')).toBe(false);
  });
});

describe('versionEnAgente', () => {
  it('saca la versión de pnpm del agente que el propio gestor escribe', () => {
    // Es la vía preferida: no depende del PATH, ni de PATHEXT, ni de qué puede
    // lanzar CreateProcess. Con `pnpm entorno` la respuesta ya está aquí.
    expect(versionEnAgente('pnpm/9.15.0 npm/? node/v22.22.2 win32 x64', 'pnpm')).toBe('9.15.0');
  });

  it('no confunde un gestor con otro', () => {
    // `npm/?` aparece en el agente de pnpm: buscar «npm» sin delimitar daría
    // un falso positivo, y además `pnpm` contiene `npm` como subcadena.
    expect(versionEnAgente('pnpm/9.15.0 npm/10.9.4 node/v22.22.2', 'npm')).toBe('10.9.4');
    expect(versionEnAgente('npm/10.9.4 node/v22.22.2', 'pnpm')).toBeNull();
  });

  it('sin agente devuelve null y se cae al plan B', () => {
    expect(versionEnAgente(undefined, 'pnpm')).toBeNull();
    expect(versionEnAgente('', 'pnpm')).toBeNull();
  });

  it('admite versiones con etiqueta', () => {
    expect(versionEnAgente('pnpm/10.0.0-beta.1 node/v22.0.0', 'pnpm')).toBe('10.0.0-beta.1');
  });
});

/**
 * D-66, TERCERA APARICIÓN · `pnpm sitio:video` no encontraba go2rtc en Windows
 *
 * El guion decía «no hay go2rtc para win32: descárguelo a mano» **con el
 * binario ya descargado y en su sitio**, por tres caminos a la vez:
 * `.sitio/bin/go2rtc` se comprobaba sin `.exe`, el recorrido del PATH igual, y
 * `GO2RTC_BIN` se leía sólo de `process.env` y no del `.env` del proyecto
 * —justo lo contrario que `GO2RTC_VERSION`, dos líneas más abajo—.
 *
 * Los dos nombres hacen falta y NO son intercambiables: para BUSCAR algo que
 * pudo instalar npm valen los candidatos; para ESCRIBIR un binario descargado o
 * nombrarlo en un error, sólo vale el nativo. Usar los candidatos ahí dejaría
 * un `go2rtc.cmd` en disco, que no es ningún programa.
 */
describe('nombreDeBinarioNativo', () => {
  it('en Windows es .exe, y nunca .cmd', () => {
    expect(nombreDeBinarioNativo('go2rtc', 'win32')).toBe('go2rtc.exe');
    expect(nombreDeBinarioNativo('go2rtc', 'win32')).not.toContain('.cmd');
  });

  it('fuera de Windows es el nombre desnudo', () => {
    expect(nombreDeBinarioNativo('go2rtc', 'darwin')).toBe('go2rtc');
    expect(nombreDeBinarioNativo('go2rtc', 'linux')).toBe('go2rtc');
  });

  it('no se confunde con candidatosDeEjecutable, que sirve para otra cosa', () => {
    // El primero de los candidatos en Windows es `.cmd`: correcto para buscar
    // un lanzador de npm, incorrecto como destino de una descarga.
    expect(candidatosDeEjecutable('go2rtc', 'win32')[0]).toBe('go2rtc.cmd');
    expect(nombreDeBinarioNativo('go2rtc', 'win32')).toBe('go2rtc.exe');
  });
});
