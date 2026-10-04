#!/usr/bin/env node
/**
 * 15-R · B2 · GENERA EL PAR VAPID DE LOS AVISOS AL RESIDENTE (ADR-036)
 *
 *   node scripts/generar-llaves-vapid.mjs
 *
 * Imprime las dos líneas para el entorno de la API y NO escribe nada en
 * disco: la privada es un secreto de Grupo Control y su sitio es Secret
 * Manager (Cloud Run) o el `.env` de la API, nunca el repositorio. P-256 con
 * `node:crypto`, sin dependencias: es todo lo que VAPID necesita.
 *
 * Rotar el par invalida TODAS las suscripciones (el navegador se suscribió con
 * la pública vieja): ver docs/guias/AVISOS_WEB_PUSH.md §5 antes de hacerlo.
 */
import { generateKeyPairSync } from 'node:crypto';

// Por JWK y no por `ECDH.getPrivateKey()`: aquel omite a veces el cero inicial.
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const publica = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(jwk.x, 'base64url'),
  Buffer.from(jwk.y, 'base64url'),
]).toString('base64url');

process.stdout.write(
  [
    '# Par VAPID generado el ' + new Date().toISOString(),
    '# La PRIVADA es secreta: Secret Manager o el .env de la API. Nunca al repositorio.',
    `WEB_PUSH_VAPID_PUBLICA=${publica}`,
    `WEB_PUSH_VAPID_PRIVADA=${jwk.d}`,
    'WEB_PUSH_SUJETO=mailto:ti@grupocontrol.co',
    '',
  ].join('\n'),
);
