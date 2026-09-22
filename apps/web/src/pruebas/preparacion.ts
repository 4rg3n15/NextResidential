/**
 * Preparación del entorno de pruebas de la consola.
 *
 * **jsdom no implementa `<dialog>`.** Se añade lo mínimo —`showModal`, `close`
 * y `open`— para que el componente se pueda montar y probar su LÓGICA: que el
 * motivo sea obligatorio, que se recorte, que no se reenvíe.
 *
 * Queda dicho lo que este relleno NO prueba, para que nadie lo dé por
 * cubierto: el atrapado del foco, el cierre con Escape y la inercia del fondo
 * los aporta el navegador de verdad, y aquí no existen. Se verifican en la
 * revisión manual de accesibilidad, no aquí. Es justamente la clase de
 * suposición —«hay una prueba, luego está comprobado»— que este proyecto ya ha
 * pagado siete veces.
 */
const prototipo = globalThis.HTMLDialogElement?.prototype;

if (prototipo !== undefined && typeof prototipo.showModal !== 'function') {
  prototipo.showModal = function abrir(this: HTMLDialogElement): void {
    this.open = true;
  };
  prototipo.close = function cerrar(this: HTMLDialogElement): void {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

/**
 * Limpieza del DOM entre pruebas.
 *
 * Con `globals: false` —que es lo correcto: nada de `describe` implícito—
 * Testing Library **no registra su limpieza automática**, así que cada
 * `render` se acumula en el mismo documento. El síntoma no es un fallo claro
 * sino «se encontraron varios elementos», que lleva a hacer las consultas más
 * específicas en vez de arreglar la causa. Se registra aquí, una vez.
 */
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL TIEMPO DE ESPERA DE LAS CONSULTAS ASÍNCRONAS · una roja intermitente
 *
 * Testing Library espera **1000 ms** por omisión en `findBy*` y `waitFor`. Esa
 * cifra es una apuesta sobre lo rápida que es la máquina, y la consola tiene
 * quince consultas que dependen de ella. En una máquina ociosa gana siempre;
 * en un runner de CI ejecutando los seis paquetes en paralelo, es una moneda al
 * aire.
 *
 * Se cayó del lado malo en la ETAPA 13, en el paso 14 del verificador —tres
 * corridas seguidas, la segunda en rojo—:
 *
 *   FAIL src/app/(consola)/viviendas/generacion.test.tsx
 *     > el primer envío PREVISUALIZA, y solo el segundo crea   2273ms
 *     → Unable to find role="button" and name `/Generar padrón/`
 *
 * **El mecanismo está comprobado, no supuesto.** Con `asyncUtilTimeout: 1` la
 * misma prueba produce el MISMO mensaje, y con ella las otras dos del fichero:
 * lo que falla es la espera, no la aserción.
 *
 * Subirlo NO debilita nada, y conviene decir por qué: una prueba que pasaba en
 * 1000 ms sigue pasando igual —el `findBy` devuelve en cuanto el elemento
 * aparece, no espera el tope—, y una que esté de verdad rota sigue fallando,
 * solo que cinco segundos más tarde. Lo único que cambia es que deja de fallar
 * por ir con prisa.
 *
 * La alternativa —poner `{ timeout }` en los quince sitios— deja el problema
 * vivo para la consulta número dieciséis. La cifra vive aquí, una vez.
 * ═══════════════════════════════════════════════════════════════════════════
 */
configure({ asyncUtilTimeout: 5_000 });

/**
 * **URLs relativas en el entorno de pruebas.**
 *
 * El cliente de la API apunta a `/api/ncr`, que es una ruta del PROPIO origen:
 * es la decisión que mantiene el token en una cookie `httpOnly` y evita que
 * ninguna URL de Supabase llegue al navegador. En un navegador real esa ruta se
 * resuelve contra el origen de la página; el `Request` de Node exige una URL
 * absoluta y falla con «Invalid URL» antes de llegar a `fetch`.
 *
 * Se le da un origen a las rutas relativas, y solo a ellas. La alternativa
 * —poner una URL absoluta en el cliente— habría cambiado el código de
 * producción para que las pruebas pasaran, que es exactamente al revés.
 */
const ORIGEN_DE_PRUEBAS = 'http://consola.de.pruebas.local';
const PeticionOriginal = globalThis.Request;

if (typeof PeticionOriginal === 'function') {
  globalThis.Request = class extends PeticionOriginal {
    constructor(entrada: RequestInfo | URL, opciones?: RequestInit) {
      super(
        typeof entrada === 'string' && entrada.startsWith('/')
          ? `${ORIGEN_DE_PRUEBAS}${entrada}`
          : entrada,
        opciones,
      );
    }
  };
}
