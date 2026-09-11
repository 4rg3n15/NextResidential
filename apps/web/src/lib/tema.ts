/**
 * Preferencia de tema: cómo se resuelve, dónde se recuerda y por qué no
 * parpadea.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRES ESTADOS, NO DOS
 *
 * Un conmutador de dos posiciones —claro / oscuro— parece más simple y es peor:
 * en cuanto alguien lo toca una vez, deja de seguir al sistema **para siempre**
 * y no hay forma de volver. Quien tiene el portátil en automático por horario
 * pierde esa función sin enterarse. Por eso hay tres: `sistema` es el valor de
 * partida y es un destino al que se puede regresar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÓNDE SE GUARDA · y por qué en dos sitios a la vez
 *
 * `localStorage` es donde vive la preferencia, pero el servidor no lo ve, así
 * que con él solo la primera pintura sale con el tema equivocado y se corrige
 * después: el destello. La **cookie** existe únicamente para que el servidor
 * pueda poner `data-tema` ya en el HTML. No es una decisión de seguridad —es
 * una preferencia visual— así que se escribe desde el cliente y no necesita
 * ruta de API ni validación en servidor más allá de descartar lo que no sea uno
 * de los tres valores.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ `data-tema` SOLO APARECE CUANDO LA ELECCIÓN ES EXPLÍCITA
 *
 * Con la preferencia en `sistema` **no se escribe atributo ninguno**, y el tema
 * lo decide la consulta `@media (prefers-color-scheme: dark)` del preset. Eso
 * tiene dos consecuencias buenas:
 *
 *  · sin JavaScript, y con la cookie vacía, el tema sale correcto igual —lo
 *    resuelve el CSS, que se aplica antes de la primera pintura—;
 *  · si el sistema cambia de tema mientras la consola está abierta, la consola
 *    cambia con él sin que nadie tenga que escuchar `matchMedia`.
 */

export const PREFERENCIAS = ['sistema', 'claro', 'oscuro'] as const;
export type PreferenciaDeTema = (typeof PREFERENCIAS)[number];

/** Tema efectivo, una vez resuelto `sistema`. */
export type TemaEfectivo = 'claro' | 'oscuro';

export const CLAVE_ALMACENAMIENTO = 'ncr.tema';
export const NOMBRE_COOKIE = 'ncr-tema';

/** Un año: es una preferencia de comodidad, no una sesión. */
export const VIDA_COOKIE_SEGUNDOS = 60 * 60 * 24 * 365;

/** Todo lo que no sea uno de los tres valores es `sistema`. Nunca lanza. */
export const preferenciaValida = (valor: string | null | undefined): PreferenciaDeTema => {
  const candidatos: readonly string[] = PREFERENCIAS;
  return valor !== null && valor !== undefined && candidatos.includes(valor)
    ? (valor as PreferenciaDeTema)
    : 'sistema';
};

/** `sistema` se resuelve con la preferencia del sistema operativo. */
export const temaEfectivo = (
  preferencia: PreferenciaDeTema,
  sistemaEnOscuro: boolean,
): TemaEfectivo => {
  if (preferencia === 'claro' || preferencia === 'oscuro') return preferencia;
  return sistemaEnOscuro ? 'oscuro' : 'claro';
};

/**
 * El valor de `data-tema` que debe llevar `<html>`. `undefined` significa
 * «ningún atributo», que es lo que deja mandar a la consulta `@media`.
 */
export const atributoDeTema = (preferencia: PreferenciaDeTema): TemaEfectivo | undefined =>
  preferencia === 'sistema' ? undefined : preferencia;

export const ETIQUETA_DE_PREFERENCIA: Readonly<Record<PreferenciaDeTema, string>> = {
  sistema: 'Seguir el sistema',
  claro: 'Tema claro',
  oscuro: 'Tema oscuro',
};

/**
 * Guion en línea que corre ANTES de pintar.
 *
 * Con la cookie presente el servidor ya puso el atributo y esto no hace nada.
 * Existe para el caso que la cookie no cubre: **una página servida por el
 * service worker desde caché**, cuyo HTML se generó con otra preferencia. Sin
 * él, ese caso concreto sí parpadearía.
 *
 * Va envuelto en `try` porque `localStorage` lanza en modo privado y con las
 * cookies de terceros bloqueadas: un fallo aquí no puede dejar la consola en
 * blanco. Lleva el nonce de la CSP, como el registro del service worker.
 */
export const GUION_DE_TEMA = `(function(){try{var p=localStorage.getItem('${CLAVE_ALMACENAMIENTO}');var e=document.documentElement;if(p==='claro'||p==='oscuro'){e.setAttribute('data-tema',p)}else if(p==='sistema'){e.removeAttribute('data-tema')}}catch(e){}})()`;
