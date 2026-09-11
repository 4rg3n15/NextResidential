#!/usr/bin/env node
/**
 * BUCKET PRIVADO DE EVIDENCIA · verificación ejercida, no declarada · RN-21
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO BASTA CON LO QUE YA HAY
 *
 * La comprobación de arranque de la API (`arranque/recursos.ts`) pregunta a
 * Storage si el bucket existe y si está marcado privado, y después pide un
 * objeto **que no existe** sin credencial. Eso deja un hueco real: un bucket
 * declarado privado pero con una política permisiva sobre `storage.objects`
 * respondería 404 a esa sonda —porque el objeto no existe— y pasaría el
 * control. La sonda comprueba que la configuración PARECE correcta.
 *
 * Este guion comprueba que falla de verdad, y la diferencia es que **sube un
 * objeto real** antes de intentar leerlo:
 *
 *   1. Sube una sonda con la llave secreta.
 *   2. La pide SIN credencial. Tiene que fallar. Si responde 200, la evidencia
 *      de todos los accesos está expuesta a cualquiera que adivine una ruta.
 *   3. La pide con una **URL firmada**. Tiene que responder 200: un bucket
 *      inalcanzable también es un fallo, sólo que del otro lado.
 *   4. Borra la sonda, pase lo que pase.
 *
 * Los pasos 2 y 3 juntos son lo que demuestra que el bucket está bien: sin el
 * 3, un bucket roto de forma que nadie pueda leerlo pasaría por seguro.
 *
 * Las credenciales salen del entorno y nunca de un fichero del repositorio.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… EVIDENCIA_BUCKET=evidencia \
 *     node scripts/verificar-bucket-evidencia.mjs
 */
import { randomUUID } from 'node:crypto';
import { entorno, morir } from './lib/supabase-admin.mjs';

const url = entorno('SUPABASE_URL');
const secreto = entorno('SUPABASE_SECRET_KEY');
const bucket = entorno('EVIDENCIA_BUCKET');

const conLlave = { apikey: secreto, Authorization: `Bearer ${secreto}` };
const objeto = `verificacion/${randomUUID()}.txt`;
const CUERPO = 'sonda de verificacion de privacidad — se borra al terminar';

const ok = (texto) => console.log(`  ✓ ${texto}`);
const mal = (texto) => {
  console.error(`  ✗ ${texto}`);
  process.exitCode = 1;
};

const rutaObjeto = `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${objeto}`;

console.log(`\nBucket de evidencia «${bucket}»\n`);

/* 0 · ¿existe y se declara privado? ------------------------------------------ */
const descripcion = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
  headers: conLlave,
}).catch(() => null);

if (descripcion === null) morir('no se pudo contactar con Storage. Revisa SUPABASE_URL.');
if (descripcion.status === 404) {
  morir(
    `el bucket «${bucket}» no existe. Créalo en Panel > Storage > New bucket, ` +
      'SIN marcar «Public bucket» (docs/guias/CONEXION_SUPABASE.md §9).',
  );
}
if (!descripcion.ok) {
  morir(
    `Storage respondió ${descripcion.status} al describir el bucket. ` +
      'Comprueba que SUPABASE_SECRET_KEY es la llave secreta (sb_secret_…) y no la publicable.',
  );
}
const detalle = await descripcion.json();
if (detalle.public === true) {
  mal(`el bucket está marcado PÚBLICO: cualquiera con la ruta ve la evidencia (RN-21)`);
} else {
  ok('el bucket existe y se declara privado');
}

/* 1 · subir la sonda --------------------------------------------------------- */
const subida = await fetch(rutaObjeto, {
  method: 'POST',
  headers: { ...conLlave, 'Content-Type': 'text/plain' },
  body: CUERPO,
});
if (!subida.ok) {
  morir(
    `no se pudo subir la sonda (${subida.status}). Sin un objeto real no se puede ` +
      'demostrar nada: lo que este guion evita es exactamente dar por buena una ' +
      'configuración que nadie ha ejercido.',
  );
}
ok('sonda subida con la llave secreta');

try {
  /* 2 · LA COMPROBACIÓN QUE IMPORTA: sin credencial, tiene que fallar -------- */
  const anonima = await fetch(rutaObjeto);
  if (anonima.status === 200) {
    mal(
      `un GET SIN FIRMAR devolvió 200 sobre un objeto que existe: la evidencia está ` +
        'expuesta. Revisa las políticas de `storage.objects`: alguna concede SELECT a `anon`.',
    );
  } else {
    ok(`un GET sin firmar sobre un objeto que EXISTE responde ${anonima.status}`);
  }

  /* 3 · con URL firmada, tiene que funcionar --------------------------------- */
  const firma = await fetch(
    `${url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${objeto}`,
    {
      method: 'POST',
      headers: { ...conLlave, 'Content-Type': 'application/json' },
      // Vida corta, como exige §2.7.8 para la evidencia real.
      body: JSON.stringify({ expiresIn: 60 }),
    },
  );
  if (!firma.ok) {
    mal(
      `no se pudo firmar una URL (${firma.status}): el bucket es inalcanzable también para la API`,
    );
  } else {
    const { signedURL } = await firma.json();
    const firmada = await fetch(`${url}/storage/v1${signedURL}`);
    if (firmada.status === 200 && (await firmada.text()) === CUERPO) {
      ok('con URL firmada de 60 s, el objeto se lee correctamente');
    } else {
      mal(`la URL firmada respondió ${firmada.status}: un bucket ilegible también es un fallo`);
    }
  }
} finally {
  /* 4 · limpiar, pase lo que pase -------------------------------------------- */
  const borrado = await fetch(rutaObjeto, { method: 'DELETE', headers: conLlave }).catch(
    () => null,
  );
  if (borrado !== null && borrado.ok) ok('sonda borrada');
  else console.error(`  ! no se pudo borrar la sonda: bórrala a mano (${bucket}/${objeto})`);
}

console.log(
  process.exitCode === 1
    ? '\n✗ el bucket de evidencia NO está en condiciones. Arregla lo marcado antes de seguir.\n'
    : '\n✓ bucket privado verificado por ejercicio: escribe con llave, niega sin firma, sirve con firma.\n',
);
