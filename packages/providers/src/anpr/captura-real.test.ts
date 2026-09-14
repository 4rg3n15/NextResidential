import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizarEventoAnpr, laCamaraDecidePorSuCuenta } from './evento-anpr';
import { analizarPaqueteAnpr } from './paquete-anpr';

/**
 * **El analizador, contra los BYTES del equipo.**
 *
 * Todo lo demás de este directorio se prueba contra una reconstrucción: yo tomé
 * la lista de campos de la validación en sitio y escribí un emisor con esa
 * forma. Es suficiente para que el simulador deje de inventarse el evento, pero
 * **no es lo mismo que el archivo real** — el separador de `plateCharBelieve`,
 * el orden de los elementos, los espacios, el prefijo de espacio de nombres y
 * el sobre exacto del envío solo los sabe la captura.
 *
 * Esta prueba se ata a `docs/insumos/hikvision/`. Mientras el directorio no
 * esté en el repositorio, **se OMITE y lo dice**: una omisión no es un verde, y
 * ésta está declarada en `ESTADO_ETAPAS.md` como lo único que falta para cerrar
 * el contrato del evento.
 */
const INSUMOS = resolve(__dirname, '../../../../docs/insumos/hikvision');

const ficheros = (directorio: string): readonly string[] => {
  if (!existsSync(directorio)) return [];
  return readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    return statSync(ruta).isDirectory() ? ficheros(ruta) : [ruta];
  });
};

const OMITIDA =
  'OMITIDA: falta la captura real en docs/insumos/hikvision/. ' +
  'El contrato del evento sigue verificado solo contra la reconstrucción.';

describe('el evento real capturado en sitio', () => {
  const todos = ficheros(INSUMOS);
  const xml = todos.filter((f) => f.toLowerCase().endsWith('.xml'));
  // El envío entero, si se guardó: `.bin`, `.raw` o `.txt` con el multipart.
  const crudos = todos.filter((f) => /\.(bin|raw|txt|http)$/i.test(f));

  it('el XML del equipo se analiza y trae todo lo que el sistema necesita', () => {
    if (xml.length === 0) {
      console.log(OMITIDA);
      return;
    }
    for (const fichero of xml) {
      const r = analizarEventoAnpr(readFileSync(fichero, 'utf8'));
      expect(r.ok, `${fichero}: ${r.ok ? '' : r.error.detalle}`).toBe(true);
      if (!r.ok) continue;

      // Lo que el sistema NO puede construir sin estos cuatro: la placa que se
      // evalúa, la confianza con la que se decide, la clave de idempotencia que
      // impide el doble registro y el instante que fecha el evento.
      expect(r.valor.placa.length, `${fichero}: placa vacía`).toBeGreaterThan(0);
      expect(r.valor.confianzaCentesimas).toBeGreaterThanOrEqual(0);
      expect(r.valor.referenciaExterna.length).toBeGreaterThan(0);
      expect(Number.isNaN(r.valor.ocurridoEn.getTime())).toBe(false);

      // Y el principio rector, medido y no supuesto.
      expect(
        laCamaraDecidePorSuCuenta(r.valor),
        `${fichero}: el equipo declara que acciona por su cuenta — hallazgo de bloqueo`,
      ).toBe(false);

      console.log(
        `captura ${fichero}: placa=${r.valor.placa} confianza=${r.valor.confianzaCentesimas} ` +
          `hora=${r.valor.ocurridoEnTextual} canal=${r.valor.canal}`,
      );
    }
  });

  it('el envío multipart entero se parte sin corromper las imágenes', () => {
    if (crudos.length === 0) {
      console.log(`${OMITIDA} (envío multipart)`);
      return;
    }
    for (const fichero of crudos) {
      const cuerpo = new Uint8Array(readFileSync(fichero));
      const texto = new TextDecoder('utf-8', { fatal: false }).decode(cuerpo.subarray(0, 4096));
      // El delimitador se deduce del propio archivo: si se guardó con sus
      // cabeceras, viene declarado; si no, se toma de la primera línea.
      const declarado = /boundary=([^\s;"']+)/i.exec(texto)?.[1];
      const primera = /^-{2,}([^\r\n]+)/.exec(texto)?.[1];
      const delimitador = declarado ?? primera;
      if (delimitador === undefined) {
        console.log(`${fichero}: no se pudo deducir el delimitador; se omite este archivo`);
        continue;
      }

      const r = analizarPaqueteAnpr(cuerpo, `multipart/form-data; boundary=${delimitador}`);
      expect(r.ok, `${fichero}: ${r.ok ? '' : r.error.detalle}`).toBe(true);
      if (!r.ok) continue;

      expect(r.valor.imagenes.length, `${fichero}: sin imágenes`).toBeGreaterThan(0);
      for (const imagen of r.valor.imagenes) {
        expect(
          [imagen.contenido[0], imagen.contenido[1]],
          `${fichero}: ${imagen.nombre} no empieza por la firma JPEG`,
        ).toEqual([0xff, 0xd8]);
      }
    }
  });
});
