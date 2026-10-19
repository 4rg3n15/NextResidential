import { describe, expect, it } from 'vitest';
import {
  barrasComidas,
  ejemploDeRutaDeSalida,
  mensajeDeRutaDentroDelRepo,
  rutaFueraDelRepo,
} from '../../../scripts/lib/ruta-fuera-del-repo.mjs';

/**
 * D-68 · LA RUTA QUE EL SHELL DESARMÓ
 *
 * Reportado desde el despliegue en Windows. En Git Bash,
 * `--informe=C:\ncr-sitio\ensayo.md` llega al guion como
 * `C:ncr-sitioensayo.md`: la barra invertida es carácter de escape y el shell
 * se la come. La ruta absoluta pasa a relativa, resuelve dentro del
 * repositorio y el control la rechaza con razón — pero el mensaje decía
 * «indique una ruta fuera» sobre una ruta que el usuario SÍ había escrito
 * fuera, sin enseñar a dónde había resuelto. El control estaba bien; el
 * diagnóstico, no.
 *
 * Dos cosas se prueban aquí: que el mensaje nombra la ruta resuelta (el dato
 * que lo explica), y que reconoce la huella de las barras comidas para dar el
 * remedio real. La plataforma se inyecta: si no, el caso que motivó la
 * corrección sólo podría comprobarse en Windows y volvería sin que nadie lo
 * notara — la misma lección de D-66.
 */
describe('barrasComidas', () => {
  it('reconoce la ruta de Windows que perdió sus barras invertidas', () => {
    expect(barrasComidas('C:ncr-sitioensayo.md')).toBe(true);
    expect(barrasComidas('c:Usersusuarioinforme.md')).toBe(true);
  });

  it('no acusa a una ruta de Windows bien formada, con cualquiera de las dos barras', () => {
    expect(barrasComidas('C:\\ncr-sitio\\ensayo.md')).toBe(false);
    expect(barrasComidas('C:/ncr-sitio/ensayo.md')).toBe(false);
  });

  it('no acusa a lo que no es una ruta de unidad', () => {
    // `C:` a secas es el directorio actual de esa unidad: no hay nada comido.
    // Y una ruta POSIX o un nombre relativo no tienen letra de unidad.
    for (const ruta of ['C:', '/home/usuario/informe.md', 'informe.md', '', undefined]) {
      expect(barrasComidas(ruta)).toBe(false);
    }
  });
});

describe('mensajeDeRutaDentroDelRepo', () => {
  it('dice a dónde resolvió la ruta: es el dato que explica el fallo', () => {
    const mensaje = mensajeDeRutaDentroDelRepo(
      'informes/ensayo.md',
      '/repo/informes/ensayo.md',
      'el informe',
      'linux',
    );
    expect(mensaje).toContain('informes/ensayo.md');
    expect(mensaje).toContain('/repo/informes/ensayo.md');
    expect(mensaje).toContain('$HOME/ncr-sitio');
  });

  it('con las barras comidas nombra la causa real y el remedio, no culpa al usuario', () => {
    const mensaje = mensajeDeRutaDentroDelRepo(
      'C:ncr-sitioensayo.md',
      'C:\\repo\\C:ncr-sitioensayo.md',
      'el informe',
      'win32',
    );
    expect(mensaje).toMatch(/barras invertidas/);
    expect(mensaje).toMatch(/carácter de escape/);
    expect(mensaje).toContain('--informe=C:/ncr-sitio/informe.md');
  });

  it('ofrece el ejemplo del sistema donde se está ejecutando', () => {
    expect(ejemploDeRutaDeSalida('win32')).toBe('C:/ncr-sitio');
    for (const plataforma of ['darwin', 'linux'] as const) {
      expect(ejemploDeRutaDeSalida(plataforma)).toBe('$HOME/ncr-sitio');
    }
  });
});

describe('rutaFueraDelRepo', () => {
  const raiz = process.cwd();
  const nunca = (): never => {
    throw new Error('no debía salir');
  };

  it('devuelve la ruta resuelta cuando cae fuera del repositorio', () => {
    const salida = rutaFueraDelRepo('/tmp/ncr-sitio/informe.md', 'el informe', raiz, nunca);
    expect(salida).toBe('/tmp/ncr-sitio/informe.md');
  });

  it('rechaza la raíz del repositorio y cualquier ruta por debajo', () => {
    for (const dentro of [raiz, `${raiz}/docs/informe.md`]) {
      const motivos: string[] = [];
      rutaFueraDelRepo(dentro, 'el informe', raiz, (m) => {
        motivos.push(m);
        return undefined as never;
      });
      expect(motivos).toHaveLength(1);
      expect(motivos[0]).toContain('NO se escribe dentro del repositorio');
    }
  });

  it('no confunde una carpeta hermana cuyo nombre empieza igual que la raíz', () => {
    // `/repo-informes` NO está dentro de `/repo`: el control compara con el
    // separador, no por prefijo de cadena.
    expect(rutaFueraDelRepo(`${raiz}-informes/x.md`, 'el informe', raiz, nunca)).toBe(
      `${raiz}-informes/x.md`,
    );
  });
});
