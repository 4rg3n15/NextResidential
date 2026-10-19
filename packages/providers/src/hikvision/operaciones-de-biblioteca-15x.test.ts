import { describe, expect, it } from 'vitest';
import { operacionesDeclaradasDeLaBiblioteca } from './rostros-y-personas';
import { PROPOSITO_CARGA_SETUP, propositoDeLaCarga } from '../terminal/forma-del-alta';

/**
 * D-70 (S-109) · EL VIDEOPORTERO DECLARABA SUS OPERACIONES DONDE NADIE MIRABA
 *
 * Visto en sitio el 19/10 con el DS-KD9633-WBE6 (V2.3.9), en el paso 3 de
 * `pnpm sitio:ensayo`:
 *
 *   «la biblioteca declara sus operaciones en supportFDFunction (post) sin
 *    «setUp», y el alta las lee en FDLibCap.supportFunction (S-109): usaría
 *    PUT /ISAPI/Intelligent/FDLib/FDSetUp y fallaría»
 *
 * El equipo SÍ decía qué admite; el alta leía otro campo, no encontraba nada y
 * caía en su respaldo —«setUp»—, que es precisamente lo que ese modelo no
 * admite. El ensayo ya era tolerante con el nombre y el anidamiento («los
 * nombres de campo varían de un firmware a otro»); el alta no, y por eso una
 * la detectaba y la otra iba a fallar.
 *
 * Lo que NO se hace, y es el corazón de esta prueba: buscar `supportFunction`
 * suelto por el documento. Ese nombre aparece dos veces con significados
 * distintos —bajo `FDLibCap` son las operaciones de la biblioteca de rostros,
 * bajo `UserInfo` las de la gestión de personas— y la de personas suele traer
 * «setup». Leer una por la otra reintroduciría el mismo fallo por el camino
 * contrario, y encima en silencio. `supportFDFunction` («FD» es Face Data) no
 * tiene ese problema y por eso ése sí se busca donde esté.
 */
describe('operacionesDeclaradasDeLaBiblioteca', () => {
  it('lee FDLibCap.supportFunction cuando el equipo lo declara ahí (la terminal)', () => {
    const json = JSON.stringify({
      FDLibCap: { supportFunction: { '@opt': 'post,delete,put,get,setUp' } },
    });
    // `listaDeclarada` conserva la grafía del equipo: no normaliza a minúsculas.
    expect(operacionesDeclaradasDeLaBiblioteca(json)).toEqual([
      'post',
      'delete',
      'put',
      'get',
      'setUp',
    ]);
  });

  it('cae a supportFDFunction cuando es ahí donde el equipo lo dice (el videoportero)', () => {
    const json = JSON.stringify({ FDLibCap: { supportFDFunction: { '@opt': 'post' } } });
    expect(operacionesDeclaradasDeLaBiblioteca(json)).toEqual(['post']);
  });

  it('lo encuentra aunque esté más abajo: el anidamiento varía de un firmware a otro', () => {
    const json = JSON.stringify({
      FDLibCap: { Biblioteca: { Rostros: { supportFDFunction: { '@opt': 'post,get' } } } },
    });
    expect(operacionesDeclaradasDeLaBiblioteca(json)).toEqual(['post', 'get']);
  });

  it('NO confunde el supportFunction de las personas con el de la biblioteca', () => {
    // El caso que haría daño: personas declara «setup» y la biblioteca sólo
    // «post». Si se leyera el de personas, el alta elegiría setUp y fallaría
    // exactamente igual que antes de la corrección, pero sin que nadie lo viera.
    const json = JSON.stringify({
      UserInfo: { supportFunction: { '@opt': 'post,delete,put,get,setup' } },
      FDLibCap: { supportFDFunction: { '@opt': 'post' } },
    });
    expect(operacionesDeclaradasDeLaBiblioteca(json)).toEqual(['post']);
  });

  it('no inventa nada cuando el equipo no declara ninguno de los dos', () => {
    for (const json of [
      null,
      'no es json',
      JSON.stringify({ UserInfo: { supportFunction: { '@opt': 'post,setup' } } }),
    ]) {
      expect(operacionesDeclaradasDeLaBiblioteca(json)).toBeUndefined();
    }
  });

  it('con lo que declara el videoportero, el alta ya NO elige setUp', () => {
    // La consecuencia, que es lo que importa: antes `operaciones` llegaba
    // `undefined`, el alta caía en su respaldo y usaba setUp contra un equipo
    // que no lo admite. Con «post» leído, elige otra operación.
    const json = JSON.stringify({ FDLibCap: { supportFDFunction: { '@opt': 'post' } } });
    const operacionesDeBiblioteca = operacionesDeclaradasDeLaBiblioteca(json);
    expect(operacionesDeBiblioteca).toEqual(['post']);
    const proposito = propositoDeLaCarga({ operacionesDeBiblioteca });
    expect(proposito).not.toBeNull();
    expect(proposito).not.toBe(PROPOSITO_CARGA_SETUP);
  });
});
