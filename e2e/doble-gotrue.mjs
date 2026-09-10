/**
 * Doble de Supabase Auth (GoTrue) con su semántica REAL, no con la que nos
 * conviene.
 *
 * Existe porque el camino del navegador nunca se había recorrido: las pruebas
 * de la consola usan dobles por módulo y `arranque-en-frio.sh` mete claims por
 * el stack HTTP, pero **entre las dos quedaba el intervalo donde vive el
 * usuario** — contraseña, inscripción, QR, verificación, `aal2`, tablero. Es el
 * intervalo declarado en DT-12, y el cliente estuvo dentro de él cuatro rondas.
 *
 * Las reglas que reproduce, todas aprendidas de fallos reales del proyecto:
 *
 *  1. **No existe `GET /auth/v1/factors`.** Los factores viven en el usuario.
 *     Pedir esa ruta devuelve 404, como en GoTrue. Fingirla fue el defecto que
 *     dejó al cliente en un ciclo cerrado durante una ronda entera.
 *  2. **`POST /factors` con `aal1` exige que no haya ningún factor verificado.**
 *     Si lo hay, responde `403 insufficient_aal`: para añadir un segundo factor
 *     hace falta `aal2`. Es lo que el proveedor real hace y lo que nadie había
 *     comprobado.
 *  3. **`qr_code` es marcado SVG EN CRUDO**, no una URL. Es lo que hacía que la
 *     pantalla mostrara el texto alternativo en vez del código.
 *  4. **`verify` devuelve un token nuevo con `aal2`.** El anterior sigue siendo
 *     `aal1`, así que sustituirlo es obligatorio.
 *  5. Los claims que emite son los del gancho de la migración `0024`: `rol`,
 *     `usuario_id`, `copropiedad_id`.
 *
 * Firma con una clave local y publica su JWKS, que es lo que la API verifica.
 * Así el camino es real de punta a punta sin tocar la red.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authenticator } from 'otplib';

/**
 * La contraseña se SORTEA en cada corrida y no se versiona. No es cosmética:
 * §2.5 prohíbe cualquier credencial literal en el repositorio, y el escáner de
 * secretos —con razón— señaló la que había aquí. Que sea efímera además elimina
 * la tentación de reutilizarla en otro sitio: no existe fuera de este proceso.
 */
export const USUARIO = {
  id: 'b66d71f7-91ea-4adc-b067-7629714e992d',
  correo: 'superadmin@ejemplo.invalid',
  contrasena: `Ncr-${randomBytes(12).toString('base64url')}`,
  rol: 'superadministrador',
  copropiedadId: null,
};

/** SVG real y decodificable: el navegador tiene que poder pintarlo de verdad. */
const svgDeQr = (semilla) => {
  const celdas = [];
  for (let f = 0; f < 21; f += 1) {
    for (let c = 0; c < 21; c += 1) {
      // Patrón determinista a partir del secreto. No es un QR escaneable —no
      // hace falta— pero SÍ es un SVG válido con tamaño, que es lo que se
      // comprueba: que el navegador lo decodifica y lo pinta.
      if ((semilla.charCodeAt((f * 21 + c) % semilla.length) + f * c) % 3 === 0) {
        celdas.push(`<rect x="${c}" y="${f}" width="1" height="1" fill="#000"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" width="210" height="210"><rect width="21" height="21" fill="#fff"/>${celdas.join('')}</svg>`;
};

export const arrancarDobleGotrue = async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'doble', alg: 'RS256', use: 'sig' };

  /** @type {{id:string,status:string,factor_type:string,friendly_name:string,secret:string}[]} */
  let factores = [];
  const sesiones = new Map();
  const desafios = new Map();
  let emisor = '';

  const emitirToken = async (aal) => {
    const token = await new SignJWT({
      aal,
      rol: USUARIO.rol,
      usuario_id: USUARIO.id,
      copropiedad_id: USUARIO.copropiedadId,
      copropiedades: [],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'doble' })
      .setSubject(USUARIO.id)
      // El emisor que la API espera es `<SUPABASE_URL>/auth/v1`, derivado de la
      // URL del proyecto. Firmar con la URL a secas producía `EMISOR_INVALIDO`
      // y un 401 en `/auth/mfa/codigos`: el mismo síntoma que el cliente vio
      // por otra causa, esta vez del doble.
      .setIssuer(`${emisor}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);
    sesiones.set(token, { aal });
    return token;
  };

  const sesionDe = (peticion) => {
    const cabecera = peticion.headers.authorization ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
    return sesiones.get(token) ?? null;
  };

  const cuerpoDe = async (peticion) => {
    const trozos = [];
    for await (const t of peticion) trozos.push(t);
    const crudo = Buffer.concat(trozos).toString('utf8');
    try {
      return crudo === '' ? {} : JSON.parse(crudo);
    } catch {
      return {};
    }
  };

  const servidor = createServer(async (peticion, respuesta) => {
    const url = new URL(peticion.url ?? '/', emisor || 'http://localhost');
    const responder = (estado, cuerpo) => {
      respuesta.writeHead(estado, { 'content-type': 'application/json' });
      respuesta.end(JSON.stringify(cuerpo));
    };
    const ruta = url.pathname;
    const cuerpo = await cuerpoDe(peticion);
    const sesion = sesionDe(peticion);

    if (ruta === '/auth/v1/jwks') return responder(200, { keys: [jwk] });

    if (ruta === '/auth/v1/token' && peticion.method === 'POST') {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        return responder(200, {
          access_token: await emitirToken('aal1'),
          refresh_token: 'refresco',
          expires_in: 600,
        });
      }
      if (cuerpo.email !== USUARIO.correo || cuerpo.password !== USUARIO.contrasena) {
        return responder(400, { error_code: 'invalid_credentials' });
      }
      // Contraseña correcta: SIEMPRE aal1. El `aal2` solo llega verificando.
      return responder(200, {
        access_token: await emitirToken('aal1'),
        refresh_token: 'refresco',
        expires_in: 600,
      });
    }

    if (ruta === '/auth/v1/user' && peticion.method === 'GET') {
      if (sesion === null) return responder(401, { error_code: 'no_authorization' });
      return responder(200, {
        id: USUARIO.id,
        email: USUARIO.correo,
        factors: factores.map(({ secret, ...resto }) => resto),
      });
    }

    // GoTrue NO expone esto. Devolverlo 404 es parte de lo que se está probando.
    if (ruta === '/auth/v1/factors' && peticion.method === 'GET') {
      return responder(404, { error_code: 'not_found' });
    }

    if (ruta === '/auth/v1/factors' && peticion.method === 'POST') {
      if (sesion === null) return responder(401, { error_code: 'no_authorization' });
      if (sesion.aal !== 'aal2' && factores.some((f) => f.status === 'verified')) {
        return responder(403, { error_code: 'insufficient_aal' });
      }
      if (factores.some((f) => f.friendly_name === cuerpo.friendly_name)) {
        return responder(422, { error_code: 'mfa_factor_name_conflict' });
      }
      const secret = authenticator.generateSecret();
      const factor = {
        id: `factor-${factores.length + 1}`,
        status: 'unverified',
        factor_type: 'totp',
        friendly_name: cuerpo.friendly_name ?? '',
        secret,
      };
      factores.push(factor);
      return responder(200, {
        id: factor.id,
        type: 'totp',
        totp: {
          // EN CRUDO, como el proveedor real.
          qr_code: svgDeQr(secret),
          secret,
          uri: `otpauth://totp/ncr:${USUARIO.correo}?secret=${secret}`,
        },
      });
    }

    const desafio = /^\/auth\/v1\/factors\/([^/]+)\/challenge$/.exec(ruta);
    if (desafio !== null && peticion.method === 'POST') {
      if (sesion === null) return responder(401, { error_code: 'no_authorization' });
      const id = `desafio-${desafios.size + 1}`;
      desafios.set(id, desafio[1]);
      return responder(200, { id, expires_at: Date.now() + 300_000 });
    }

    const verificar = /^\/auth\/v1\/factors\/([^/]+)\/verify$/.exec(ruta);
    if (verificar !== null && peticion.method === 'POST') {
      if (sesion === null) return responder(401, { error_code: 'no_authorization' });
      const factor = factores.find((f) => f.id === verificar[1]);
      if (factor === undefined) return responder(404, { error_code: 'mfa_factor_not_found' });
      if (!authenticator.check(String(cuerpo.code ?? ''), factor.secret)) {
        return responder(400, { error_code: 'mfa_verification_failed' });
      }
      factor.status = 'verified';
      return responder(200, {
        access_token: await emitirToken('aal2'),
        refresh_token: 'refresco',
        expires_in: 600,
      });
    }

    const borrar = /^\/auth\/v1\/factors\/([^/]+)$/.exec(ruta);
    if (borrar !== null && peticion.method === 'DELETE') {
      factores = factores.filter((f) => f.id !== borrar[1]);
      return responder(200, {});
    }

    if (ruta === '/auth/v1/logout') return responder(204, {});
    return responder(404, { error_code: 'not_found' });
  });

  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  const puerto = servidor.address().port;
  emisor = `http://127.0.0.1:${puerto}`;

  return {
    url: emisor,
    jwksUrl: `${emisor}/auth/v1/jwks`,
    factores: () => factores.map((f) => ({ ...f })),
    cerrar: () => new Promise((listo) => servidor.close(listo)),
  };
};
