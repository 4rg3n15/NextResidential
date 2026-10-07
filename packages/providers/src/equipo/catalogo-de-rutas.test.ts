import { describe, expect, it } from 'vitest';
import { RUTAS, rutaPara, rutasDeFamilia, rutasPor } from './catalogo-de-rutas';

/**
 * El catálogo no se prueba «por probar algo»: lo que se fija aquí es la regla
 * del repositorio —ninguna ruta sin etiqueta de procedencia— en una forma que
 * rompe el día que alguien añada una a medias.
 */
describe('catálogo de rutas', () => {
  it('NINGUNA ruta se queda sin procedencia ni sin fuente', () => {
    for (const r of RUTAS) {
      expect(r.procedencia, `${r.proposito}: sin procedencia`).toMatch(
        /^(verificada|guia_oficial|documentada)$/,
      );
      expect(r.fuente.length, `${r.proposito}: la fuente está vacía`).toBeGreaterThan(20);
    }
  });

  it('toda ruta respaldada por la GUÍA cita su SECCIÓN, con número', () => {
    /**
     * El grado intermedio se añadió el 23/09/2026 porque «documentada» mezclaba
     * dos cosas: lo que dice la guía del fabricante para esta familia y lo que
     * se dedujo de la forma habitual de ISAPI. Tratarlas igual obliga a
     * desconfiar de las dos por igual, y entonces la etiqueta no informa.
     *
     * **Y desde la 15-C el capítulo es un NÚMERO.** Antes decía de qué trataba
     * —«control de la barrera»— porque el destilado llegó como texto suelto.
     * Con la guía integral delante, una referencia sin número obliga a buscar
     * por palabras delante del equipo, que es justo cuando menos tiempo hay.
     */
    for (const r of rutasPor('guia_oficial')) {
      expect(r.capitulo, `${r.proposito}: sin sección citada`).toBeTruthy();
      expect(r.capitulo, `${r.proposito}: la sección no lleva número`).toMatch(/§\d/);
      expect(r.fuente, r.proposito).toMatch(/gu[ií]a (oficial|ISAPI)/i);
    }
  });

  it('citar la sección NO asciende una ruta a verificada', () => {
    // Verificadas sólo las demostradas frente al aparato: la barrera y, desde
    // el anexo 15-K, las dos aperturas de puerta. Que el fabricante lo
    // documente no demuestra que ESTE firmware lo implemente.
    expect(rutasPor('verificada').map((r) => r.proposito)).toEqual([
      'accionar la barrera vehicular',
      'abrir la puerta desde la plataforma',
      'abrir la puerta del videoportero',
    ]);
    for (const r of rutasPor('verificada')) expect(r.capitulo).toBeUndefined();
  });

  it('la primera pregunta del sondeo NO exige credenciales', () => {
    // Es lo que separa «no hay equipo en esa dirección» de «la credencial es
    // mala», que se resuelven de formas distintas y una de ellas bloquea la
    // cuenta del equipo si se reintenta.
    const activacion = RUTAS.find((r) => /sin presentar credenciales/.test(r.proposito));
    expect(activacion).toBeDefined();
    expect(activacion?.metodo).toBe('GET');
  });

  it('la ruta de `ctrlMod` está en el catálogo: es la que decide quién manda', () => {
    // Antes del 23/09/2026 no aparecía en una sola línea del árbol, y el
    // principio rector del producto no lo comprobaba nadie.
    const modo = RUTAS.find((r) => /quién controla la barrera/.test(r.proposito));
    expect(modo).toBeDefined();
    expect(modo?.procedencia).toBe('guia_oficial');
    expect(modo?.confirmarEnSitio).toMatch(/valga 1/);
  });

  it('toda ruta DOCUMENTADA dice qué comprobar en sitio para ascenderla', () => {
    // Una etiqueta «pendiente de verificar» sin decir qué verificar no sirve
    // de nada delante del equipo: es la mitad del control.
    for (const r of rutasPor('documentada')) {
      expect(r.confirmarEnSitio, `${r.proposito}: no dice qué comprobar`).toBeTruthy();
    }
  });

  it('cada VERIFICADA cita su captura: la barrera y las dos aperturas de puerta', () => {
    const barrera = rutasPor('verificada').find(
      (r) => r.proposito === 'accionar la barrera vehicular',
    );
    expect(barrera?.fuente).toMatch(/15\/09\/2026/);
    // Y deja escrito el error que costó dos intentos, para que no se repita.
    expect(barrera?.fuente).toMatch(/notSupport/);
    // Anexo 15-K · las puertas, con la fecha, el firmware y el Content-Type.
    for (const r of rutasPor('verificada').filter((x) => /puerta/.test(x.proposito))) {
      expect(r.fuente).toMatch(/26\/09\/2026/);
      expect(r.fuente).toMatch(/V4\.47\.0|V2\.3\.9/);
      expect(r.cuerpo?.tipo).toBe('application/x-www-form-urlencoded; charset=UTF-8');
      expect(r.cuerpo?.contenido).toMatch(
        /<RemoteControlDoor xmlns="http:\/\/www\.isapi\.org\/ver20\/XMLSchema" version="2\.0">/,
      );
    }
  });

  it('las rutas de una familia incluyen las comunes', () => {
    const deTerminal = rutasDeFamilia('terminal');
    expect(deTerminal.some((r) => r.familia === 'comun')).toBe(true);
    expect(deTerminal.some((r) => r.familia === 'videoportero')).toBe(false);
  });

  it('pedir una ruta que no existe LANZA, no devuelve nada silenciosamente', () => {
    // Un `undefined` aquí acabaría como `http://equipo/undefined`, que el
    // aparato contestaría con un 404 indistinguible de una ruta mal capturada.
    expect(() => rutaPara('teletransportar al visitante', 'terminal')).toThrow(/no catalogada/i);
  });

  it('toda ruta que ACCIONA algo lleva su cuerpo aquí, y no en quien la invoca', () => {
    /**
     * El cuerpo es vocabulario del fabricante tanto como la ruta: nombres de
     * elemento y de campo. KPI-11 lo demostró en cuanto el guion de puesta en
     * marcha escribió el XML de la barrera por su cuenta. Un guion de operación
     * no tiene por qué saber cómo se llama el campo de modo de una talanquera,
     * y si lo supiera habría dos sitios que corregir el día que la captura real
     * lo cambie.
     */
    for (const r of RUTAS.filter((x) => x.acciona === true)) {
      expect(r.cuerpo, `${r.proposito}: acciona y no trae cuerpo`).toBeDefined();
      expect(r.cuerpo?.tipo, r.proposito).toMatch(/\//);
      expect((r.cuerpo?.contenido ?? '').length, r.proposito).toBeGreaterThan(10);
    }
  });

  it('las rutas que dejan rastro están marcadas: no se sondean a ciegas', () => {
    // Dar de alta o suprimir una plantilla deja rastro en el aparato, y abrir
    // el canal de audio se lo quita a quien esté hablando. El guion las salta.
    const conRastro = RUTAS.filter((r) => r.dejaRastro === true).map((r) => r.proposito);
    expect(conRastro).toContain('cargar la plantilla facial');
    expect(conRastro).toContain('suprimir la plantilla facial');
    expect(conRastro).toContain('abrir el canal de audio bidireccional');
    // Y ninguna que accione está marcada también como rastro: serían dos
    // motivos distintos para saltarla y el mensaje diría el que no es.
    expect(RUTAS.filter((r) => r.acciona === true && r.dejaRastro === true)).toEqual([]);
  });

  /**
   * 15-S1 · B · el audio de la terminal es por CAPACIDAD: sus rutas sólo existen
   * si la terminal lo declara. Sin la marca, el guion de sitio contaba como
   * «desmentida» —un fallo— la lista de canales de una terminal sin audio (paso
   * 12e del verificador, 07/10), y la K1T344 puede no traerlo. El videoportero
   * sí lo trae (VERIFICADO el 06/10): sus rutas no llevan la marca.
   */
  it('las rutas de audio de la TERMINAL son de módulo opcional; las del videoportero, no', () => {
    const deAudio = (familia: 'terminal' | 'videoportero') =>
      RUTAS.filter(
        (r) =>
          r.familia === familia &&
          /audio bidireccional|audio al equipo|audio del equipo/.test(r.proposito),
      );
    expect(deAudio('terminal')).toHaveLength(5);
    for (const r of deAudio('terminal')) {
      expect(r.soloSiLaDeclara, r.proposito).toMatch(/audio bidireccional/);
    }
    expect(deAudio('videoportero').length).toBeGreaterThanOrEqual(5);
    for (const r of deAudio('videoportero')) {
      expect(r.soloSiLaDeclara, r.proposito).toBeUndefined();
    }
  });

  it('ninguna ruta lleva una dirección de equipo dentro', () => {
    // KPI-11 lo comprueba en todo el árbol; aquí se fija en el sitio donde más
    // fácil sería colar una «para probar».
    for (const r of RUTAS) {
      expect(r.ruta).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
      expect(r.ruta.startsWith('/')).toBe(true);
    }
  });
});
