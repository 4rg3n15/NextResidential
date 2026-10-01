import 'server-only';
import { cache } from 'react';
import type { AlcanceDeCopropiedades, Sesion } from '@ncr/contracts';
import { configuracion } from '../configuracion';
import { reenvioDeIpActual } from './ip-del-navegador';
import { registrar } from '../registro';
import { tokenDeLectura } from './token';

/**
 * SOLO PARA DIAGNÓSTICO: los NOMBRES de los claims del token, jamás sus
 * valores. Esto no decide nada —la autoridad sobre los claims sigue siendo la
 * API, por eso existe `GET /auth/sesion`—; solo permite que un rechazo diga
 * qué le falta al token en vez de dejar un rebote mudo.
 */
const nombresDeClaims = (accessToken: string): string => {
  try {
    const carga = accessToken.split('.')[1];
    if (carga === undefined) return '';
    const json: unknown = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'));
    return typeof json === 'object' && json !== null ? Object.keys(json).sort().join(',') : '';
  } catch {
    return '';
  }
};

/**
 * Sesión vista desde el servidor: se le pregunta a la API, no al token.
 *
 * Se podría leer el rol decodificando el JWT aquí, y sería más rápido. No se
 * hace: el rol y el alcance son **lo que la API reconoce**, y decodificar el
 * token por nuestra cuenta crearía una segunda interpretación de los claims que
 * se separaría de la del guard a la primera diferencia —un claim renombrado, un
 * rol nuevo—. `GET /auth/sesion` existe justamente para no tener dos.
 *
 * `cache` de React deduplica la llamada dentro de una misma petición: el layout
 * y la página la piden ambos y solo sale una al servidor.
 */
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const token = await tokenDeLectura();
  if (token === null) return null;

  const { apiUrl } = configuracion();
  try {
    const respuesta = await fetch(`${apiUrl}/auth/sesion`, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
        ...(await reenvioDeIpActual()),
      },
      cache: 'no-store',
    });
    if (!respuesta.ok) {
      /**
       * **POR QUÉ SE REGISTRA.** Devolver `null` sin más convierte cualquier
       * rechazo de la API en «vuelve al login», sin una palabra de por qué.
       * Es el síntoma que costó una ronda entera: el usuario verificaba su
       * código de seis dígitos, la API rechazaba el token y la consola lo
       * devolvía a la pantalla de acceso como si no hubiera pasado nada.
       *
       * Se registran el estado y los NOMBRES de los claims presentes —nunca sus
       * valores, nunca el token—, porque el fallo típico es un token bien
       * firmado al que le falta `rol` porque el gancho de claims del proyecto
       * no está activo. Con esa línea, «vuelve al login» pasa a ser «tu token
       * no trae rol».
       */
      registrar('aviso', 'la API rechazó la sesión: la consola volverá al acceso', {
        estado: respuesta.status,
        claims: nombresDeClaims(token.accessToken),
        pista:
          respuesta.status === 401
            ? 'token sin rol/copropiedad (gancho de claims), nivel aal1 con MFA obligatorio, o firma no verificable'
            : 'ver la bitácora de la API',
      });
      return null;
    }
    return (await respuesta.json()) as Sesion;
  } catch {
    // API caída: no hay sesión *utilizable*. Devolver una sesión a medias haría
    // que el layout pintara una navegación que no lleva a ninguna parte.
    return null;
  }
});

/**
 * Catálogo de copropiedades que el token alcanza, preguntado a la API.
 *
 * Igual que `sesionActual`: la autoridad sobre el alcance es la API, no una
 * interpretación propia de los claims. Aquí eso importa el doble, porque el
 * alcance del superadministrador **no está en el token**: su `copropiedad_id`
 * es nulo y quien lo resuelve es `app.es_superadmin()` en la base.
 */
export const alcanceDeCopropiedades = cache(async (): Promise<AlcanceDeCopropiedades | null> => {
  const token = await tokenDeLectura();
  if (token === null) return null;

  const { apiUrl } = configuracion();
  try {
    const respuesta = await fetch(`${apiUrl}/copropiedades`, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
        ...(await reenvioDeIpActual()),
      },
      cache: 'no-store',
    });
    if (!respuesta.ok) {
      registrar('aviso', 'la API rechazó el catálogo de copropiedades', {
        estado: respuesta.status,
        pista:
          respuesta.status === 401
            ? 'token sin rol o sin segundo factor'
            : 'ver la bitácora de la API',
      });
      return null;
    }
    return (await respuesta.json()) as AlcanceDeCopropiedades;
  } catch {
    return null;
  }
});

/**
 * H5 (15-L) · si el MODO PRUEBAS está activo: la consola pinta la franja fija
 * para todo el que tiene sesión. Se pregunta en cada página —el interruptor
 * surte efecto sin reiniciar— y, si la API no contesta, no se pinta: la
 * franja informa, no decide nada.
 */
/**
 * F3 (corrección de la 15-L) · la frase de la franja «equipos simulados», o
 * `null`. La decide la API (simulado Y con equipos dados de alta en ESTA
 * copropiedad); un fallo al preguntar no pinta nada: la franja es un aviso, no
 * una condición para usar la consola.
 */
export const avisoDeEquiposSimulados = cache(
  async (copropiedadId: string): Promise<string | null> => {
    const token = await tokenDeLectura();
    if (token === null) return null;
    const { apiUrl } = configuracion();
    try {
      const r = await fetch(
        `${apiUrl}/copropiedades/${encodeURIComponent(copropiedadId)}/equipos-simulados`,
        {
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            Accept: 'application/json',
            ...(await reenvioDeIpActual()),
          },
          cache: 'no-store',
        },
      );
      if (!r.ok) return null;
      const aviso = ((await r.json()) as { aviso?: unknown }).aviso;
      return typeof aviso === 'string' ? aviso : null;
    } catch {
      return null;
    }
  },
);

export const modoPruebasActivo = cache(async (): Promise<boolean> => {
  const token = await tokenDeLectura();
  if (token === null) return false;
  const { apiUrl } = configuracion();
  try {
    const r = await fetch(`${apiUrl}/plataforma/modo-pruebas`, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
        ...(await reenvioDeIpActual()),
      },
      cache: 'no-store',
    });
    return r.ok && ((await r.json()) as { activo?: unknown }).activo === true;
  } catch {
    return false;
  }
});
