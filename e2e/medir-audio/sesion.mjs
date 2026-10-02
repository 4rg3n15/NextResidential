/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P1 · UNA SESIÓN DE MEDIDA: ABRIR, VUELTA, IDA, AL PULSAR, COLGAR
 *
 * Todo instante sale del mismo reloj (misma máquina): `Date.now()` en el
 * equipo simulado y `performance.timeOrigin + performance.now()` en la página.
 * Lo que no llega a tiempo NO se inventa: cuenta como marca perdida.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const PLAZO_MS = 5000;
/** Hasta cuánto se espera el `close` en el equipo tras colgar, para poder decir cuánto tarda. */
export const PLAZO_DE_CIERRE_MS = 60_000;

export const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));

export const hasta = async (condicion, etiqueta, plazo = PLAZO_MS) => {
  const limite = Date.now() + plazo;
  for (;;) {
    const valor = await condicion();
    if (valor !== false && valor !== undefined && valor !== null) return valor;
    if (Date.now() > limite) throw new Error(`no llegó a tiempo: ${etiqueta}`);
    await dormir(2);
  }
};

export const medidasVacias = () => ({
  escucha: [],
  subida: [],
  ida: [],
  vuelta: [],
  alPulsar: [],
  cierre: [],
  perdidas: 0,
  sinCierre: 0,
  cerradaSola: 0,
});

export const resumen = (valores) => {
  const v = [...valores].sort((a, b) => a - b);
  const en = (p) => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
  return v.length === 0
    ? null
    : {
        n: v.length,
        mediana: Math.round(en(0.5)),
        p95: Math.round(en(0.95)),
        max: Math.round(v.at(-1)),
      };
};

const marcarVuelta = async (pagina, equipo, m) => {
  const antes = await pagina.evaluate(() => window.__ncr.vuelta.length);
  const emitidas = equipo.bajada.marcasEmitidas.length;
  equipo.bajada.marcar();
  try {
    const oida = await hasta(
      async () => (await pagina.evaluate((n) => window.__ncr.vuelta[n], antes)) ?? false,
      'marca de vuelta',
    );
    m.vuelta.push(oida - (await hasta(() => equipo.bajada.marcasEmitidas[emitidas], 'emitida')));
  } catch {
    m.perdidas += 1;
  }
};

const marcarIda = async (pagina, equipo, m) => {
  const antes = equipo.marcasRecibidas.length;
  const t = await pagina.evaluate(() => window.__marcarIda());
  try {
    await hasta(() => equipo.marcasRecibidas.length > antes, 'marca de ida');
    m.ida.push(equipo.marcasRecibidas.at(-1) - t);
  } catch {
    m.perdidas += 1;
  }
};

/** Al pulsar: el tono YA suena cuando se pulsa; cuenta lo que tarda en salir. */
const medirAlPulsar = async (pagina, equipo, camino, m) => {
  await camino.soltar();
  await dormir(400);
  await pagina.evaluate(() => window.__tono(0.5));
  const antes = equipo.marcasRecibidas.length;
  const t = await pagina.evaluate(() => performance.timeOrigin + performance.now());
  await camino.pulsar();
  try {
    await hasta(() => equipo.marcasRecibidas.length > antes, 'audio al pulsar');
    m.alPulsar.push(equipo.marcasRecibidas.at(-1) - t);
  } catch {
    m.perdidas += 1;
  }
  await pagina.evaluate(() => window.__tono(0));
};

export const medirSesion = async (pagina, equipo, camino, m, marcas) => {
  const subidasAntes = equipo.subidasAceptadas.length;
  const { inicio, bajadaLista } = await camino.abrir();
  m.escucha.push(bajadaLista - inicio);
  await camino.pulsar();
  m.subida.push(
    (await hasta(() => equipo.subidasAceptadas[subidasAntes], 'subida aceptada')) - inicio,
  );
  await dormir(400);
  // La vuelta primero: si la ida de un transporte se atasca, no contamina la vuelta.
  for (let k = 0; k < marcas; k += 1) {
    await marcarVuelta(pagina, equipo, m);
    await dormir(700);
  }
  for (let k = 0; k < marcas; k += 1) {
    await marcarIda(pagina, equipo, m);
    await dormir(700);
  }
  if (camino.soltar !== undefined) await medirAlPulsar(pagina, equipo, camino, m);
  // Si el canal ya se cerró solo (la escucha cayó antes de colgar), se dice.
  if (!equipo.estado().sesionAbierta) {
    m.cerradaSola += 1;
    await camino.cerrar();
    return;
  }
  const cierres = equipo.estado().cierres;
  const colgado = Date.now();
  await camino.cerrar();
  try {
    await hasta(() => equipo.estado().cierres > cierres, 'close en el equipo', PLAZO_DE_CIERRE_MS);
    m.cierre.push(Date.now() - colgado);
  } catch {
    m.sinCierre += 1;
  }
};

export const resumenDeOpcion = (m, equipo) => ({
  establecimientoEscuchaMs: resumen(m.escucha),
  establecimientoSubidaMs: resumen(m.subida),
  idaMs: resumen(m.ida),
  vueltaMs: resumen(m.vuelta),
  alPulsarMs: resumen(m.alPulsar),
  cierreMs: resumen(m.cierre),
  marcasPerdidas: m.perdidas,
  sesionesConCanalTomadoTrasColgar: m.sinCierre,
  sesionesCerradasSolasAntesDeColgar: m.cerradaSola,
  entramadoDeSubida: equipo.estado().entramadoDeSubida,
});
