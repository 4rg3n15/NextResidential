import { describe, expect, it } from 'vitest';
import { candidatosDeEjecutable } from '../../../scripts/lib/ejecutable-del-sistema.mjs';
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
