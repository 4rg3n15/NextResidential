#!/usr/bin/env node
// =============================================================================
// KPI-11 · El protocolo del fabricante vive en UN solo paquete
//
// La ETAPA 15 sustituye `MockProvider` por `HikvisionProvider` sin tocar nada
// más (ADR-03). Eso solo es cierto si el resto del código no sabe que existe
// ISAPI ni conoce la IP de un equipo. Comprobarlo por lectura no escala: se
// comprueba aquí, y el build se rompe.
//
// Se revisa el CÓDIGO, no la documentación: `docs/` describe el protocolo a
// propósito, y la guía de integración de la ETAPA 15 está escrita para
// ejecutarse frente al equipo físico.
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

/** Único lugar donde el protocolo del fabricante está permitido (§2.9). */
const PAQUETE_PERMITIDO = join('packages', 'providers');

const RAICES = ['apps', 'packages', 'supabase', 'scripts'];
/**
 * Directorios que NO son código fuente y por tanto quedan fuera del recorrido.
 *
 * `.next` se añadió en la ETAPA 09-B, y el motivo importa. KPI-11 mide
 * **referencias en el código** —así lo resolvió `03-mockups.md` M-07: «una IP
 * leída de la base y renderizada no es una referencia en código fuente»— y
 * `.next/` es artefacto generado, no fuente. Que estuviera dentro del recorrido
 * era un agujero latente: el control decía medir una cosa y medía otra.
 *
 * Lo destapó añadir `lucide-react`. Los datos de trazado de sus iconos son
 * secuencias de coordenadas —`2.95.6.6`, `4.5.8.8`— que la expresión de IPv4
 * casa perfectamente. El control pasó de verde a rojo por una dependencia de
 * iconos, sin que ninguna IP de dispositivo se hubiera acercado al repositorio.
 * Un falso positivo así es tan dañino como un falso negativo: enseña a
 * desactivar el control.
 */
const IGNORADOS = new Set(['node_modules', 'dist', 'coverage', '.turbo', '.git', 'build', '.next']);
const EXTENSIONES = /\.(ts|tsx|js|mjs|cjs|dart|sql|sh|yml|yaml)$/;

/**
 * Vocabulario del fabricante. Ninguna de estas palabras puede aparecer fuera
 * del paquete de proveedores — ni en código ni en comentarios.
 *
 * Las cuatro últimas se añadieron con el adaptador de barrera del 15/09/2026:
 * son el módulo, el elemento y el campo de la única ruta verificada contra el
 * equipo. Sin ellas el control decía vigilar la frontera y vigilaba media, y
 * KPI-11 ya encontró una fuga de este tipo una vez en la ETAPA 10.
 */
const PALABRAS = [
  /\bISAPI\b/i,
  /\bTwoWayAudio\b/i,
  /\bhikvision\b/i,
  /\bParking\b/,
  /\bBarrierGate\b/i,
  /\bctrlMode\b/i,
  /\bbarrierGateCtrlType\b/i,
];

// IPv4 literal. Se excluyen las que no identifican un equipo: loopback, «todas
// las interfaces» y la difusión. Una IP de dispositivo en el código sería
// además un incumplimiento de RN-21 y de §2.7.1.
const IPV4 = /(?<![\d.])((?:\d{1,3}\.){3}\d{1,3})(?![\d.])/g;
const IPS_NEUTRAS = new Set(['127.0.0.1', '0.0.0.0', '255.255.255.255', '1.1.1.1']);

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS RANGOS DE DOCUMENTACIÓN (RFC 5737), Y POR QUÉ NO SON UNA EXENCIÓN
 *
 * `192.0.2.0/24`, `198.51.100.0/24` y `203.0.113.0/24` están RESERVADOS por el
 * IETF para ejemplos y documentación: no se enrutan, no los usa nadie y no
 * pueden pertenecer a ningún equipo de ningún conjunto. Escribir una de ellas
 * en un ejemplo no es lo que este control persigue.
 *
 * Lo que persigue es **la IP de un equipo real**, y por eso la tentación
 * correcta a resistir es la contraria: aceptar `192.168.x.x` «porque es una red
 * privada». Ésas sí son direcciones de equipos de verdad —la cámara del
 * proyecto vivía en una—, y siguen prohibidas.
 *
 * Con estos rangos, un ejemplo de la guía o una semilla pueden enseñar una
 * dirección con forma de dirección sin que nadie tenga que inventarse una que
 * podría ser la de alguien.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const RANGOS_DE_DOCUMENTACION = [/^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./];
const esDeDocumentacion = (ip) => RANGOS_DE_DOCUMENTACION.some((r) => r.test(ip));
const esIpValida = (ip) => ip.split('.').every((o) => Number(o) <= 255 && !/^0\d/.test(o));

/** Una línea puede eximirse de forma explícita y auditable, nunca en silencio. */
const EXENCION = /kpi-11-exento/i;

function* ficheros(dir) {
  for (const entrada of readdirSync(dir)) {
    if (IGNORADOS.has(entrada)) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) yield* ficheros(ruta);
    else if (EXTENSIONES.test(entrada)) yield ruta;
  }
}

const hallazgos = [];
for (const raiz of RAICES) {
  let base;
  try {
    base = statSync(join(RAIZ, raiz));
  } catch {
    continue;
  }
  if (!base.isDirectory()) continue;

  for (const ruta of ficheros(join(RAIZ, raiz))) {
    const relativa = relative(RAIZ, ruta);
    // El propio verificador nombra lo que persigue; excluirlo evita que se
    // denuncie a sí mismo, que es el falso positivo más tonto posible.
    if (relativa === join('scripts', 'lib', 'frontera-hardware.mjs')) continue;
    // Y el control de extensibilidad (O2, ETAPA 15-D) nombra los adaptadores de
    // marca para impedir que alguien los construya fuera del paquete: mismo caso.
    if (relativa === join('scripts', 'lib', 'frontera-extensibilidad.mjs')) continue;
    if (relativa.startsWith(PAQUETE_PERMITIDO + sep)) continue;

    const lineas = readFileSync(ruta, 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      if (EXENCION.test(linea)) return;
      for (const patron of PALABRAS) {
        if (patron.test(linea)) {
          hallazgos.push({ relativa, n: i + 1, que: patron.source, linea: linea.trim() });
        }
      }
      for (const [, ip] of linea.matchAll(IPV4)) {
        if (IPS_NEUTRAS.has(ip) || esDeDocumentacion(ip) || !esIpValida(ip)) continue;
        hallazgos.push({ relativa, n: i + 1, que: `IP ${ip}`, linea: linea.trim() });
      }
    });
  }
}

if (hallazgos.length > 0) {
  for (const h of hallazgos) {
    console.error(`✗ ${h.relativa}:${h.n} · ${h.que} — ${h.linea.slice(0, 100)}`);
  }
  console.error(
    `\nKPI-11: el protocolo del fabricante solo puede aparecer en ${PAQUETE_PERMITIDO}/.`,
  );
  process.exit(1);
}

console.log(
  `KPI-11: sin ISAPI ni IPs de dispositivo fuera de ${PAQUETE_PERMITIDO}/ ` +
    '(los rangos de documentación de RFC 5737 no cuentan: no son de nadie)',
);
