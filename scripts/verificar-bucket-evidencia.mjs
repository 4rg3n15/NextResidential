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
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SONDA ES UN PNG REAL, Y ESO NO ES UN DETALLE
 *
 * §7.1 de la guía manda configurar el bucket con `Allowed MIME types` =
 * `image/jpeg, image/png`. Un guion que subiera texto plano chocaría con esa
 * restricción y devolvería 400, y la salida obvia —relajar los tipos
 * permitidos— **debilitaría el bucket para que la comprobación pase**, que es
 * exactamente al revés de lo que una verificación debe provocar.
 *
 * Así que la sonda es una imagen PNG mínima y válida: 1×1 RGBA, 70 bytes,
 * firma `89 50 4E 47` incluida. Pasa por el filtro de tipo del bucket **y** por
 * la validación de tipo REAL que la API hace por contenido y no por extensión
 * (§2.7.8), porque es un PNG de verdad y no una extensión mentida.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO FALLO MUESTRA EL CUERPO QUE DEVOLVIÓ STORAGE
 *
 * Un 400 a secas obliga a adivinar. Storage explica en el cuerpo si el tipo no
 * está permitido, si el objeto pasa del tamaño máximo o si la llave no alcanza,
 * y esa frase es la que ahorra la tarde. Se recorta a 300 caracteres y **nunca
 * se imprime ninguna credencial**.
 *
 * Las credenciales salen del entorno y nunca de un fichero del repositorio.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… EVIDENCIA_BUCKET=evidencias \
 *     node scripts/verificar-bucket-evidencia.mjs
 */
import { randomUUID } from 'node:crypto';
import { entorno, morir } from './lib/supabase-admin.mjs';

const url = entorno('SUPABASE_URL');
const secreto = entorno('SUPABASE_SECRET_KEY');
const bucket = entorno('EVIDENCIA_BUCKET');

const conLlave = { apikey: secreto, Authorization: `Bearer ${secreto}` };
const objeto = `verificacion/${randomUUID()}.png`;

/**
 * PNG de 1×1 píxel RGBA. Se guarda en base64 y se comprueba al arrancar: si
 * alguien lo edita y deja de ser un PNG, el guion lo dice aquí en vez de
 * chocar contra Storage con un 400 que parecería un problema del bucket.
 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SONDA = Buffer.from(PNG_BASE64, 'base64');
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ok = (texto) => console.log(`  ✓ ${texto}`);
const mal = (texto) => {
  console.error(`  ✗ ${texto}`);
  process.exitCode = 1;
};

/**
 * El cuerpo del error, tal como lo devolvió Storage. Es donde vive el motivo
 * real —«mime type text/plain is not supported», «Payload too large»,
 * «new row violates row-level security policy»— y sin él un 400 no dice nada.
 */
const detalleDe = async (respuesta) => {
  const crudo = await respuesta.text().catch(() => '');
  const limpio = crudo.replace(/\s+/g, ' ').trim();
  if (limpio === '') return `${respuesta.status} (Storage no devolvió cuerpo)`;
  return `${respuesta.status} · ${limpio.slice(0, 300)}`;
};

const rutaObjeto = `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${objeto}`;

console.log(`\nBucket de evidencia «${bucket}»\n`);

if (!SONDA.subarray(0, 8).equals(FIRMA_PNG)) {
  morir('la sonda incrustada ya no es un PNG válido: revisa PNG_BASE64 en este guion.');
}

/* 0 · ¿existe y se declara privado? ------------------------------------------ */
const descripcion = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
  headers: conLlave,
}).catch(() => null);

if (descripcion === null) morir('no se pudo contactar con Storage. Revisa SUPABASE_URL.');
if (descripcion.status === 404) {
  morir(
    `el bucket «${bucket}» no existe. Créalo en Panel > Storage > New bucket, ` +
      'SIN marcar «Public bucket» (docs/guias/CONEXION_SUPABASE.md §7.1).',
  );
}
if (!descripcion.ok) {
  morir(
    `Storage respondió ${await detalleDe(descripcion)} al describir el bucket. ` +
      'Comprueba que SUPABASE_SECRET_KEY es la llave secreta (sb_secret_…) y no la publicable.',
  );
}
const detalle = await descripcion.json();
if (detalle.public === true) {
  mal('el bucket está marcado PÚBLICO: cualquiera con la ruta ve la evidencia (RN-21)');
} else {
  ok('el bucket existe y se declara privado');
}

const tipos = detalle.allowed_mime_types;
if (Array.isArray(tipos) && tipos.length > 0) {
  ok(`tipos permitidos: ${tipos.join(', ')}`);
  if (!tipos.includes('image/png')) {
    // No se relaja el bucket para que la sonda entre: se dice que la sonda no
    // cabe y que el bucket manda.
    morir(
      `el bucket no admite image/png, así que esta sonda no puede subirse. ` +
        'Si la restricción es intencionada, ajusta la sonda de este guion al tipo ' +
        'que el bucket sí acepte; NO relajes el bucket para que la prueba pase.',
    );
  }
}

/* 1 · subir la sonda --------------------------------------------------------- */
const subida = await fetch(rutaObjeto, {
  method: 'POST',
  headers: { ...conLlave, 'Content-Type': 'image/png' },
  body: SONDA,
});
if (!subida.ok) {
  morir(
    `no se pudo subir la sonda: ${await detalleDe(subida)}\n\n` +
      '  Sin un objeto real no se puede demostrar nada: lo que este guion evita es\n' +
      '  exactamente dar por buena una configuración que nadie ha ejercido.',
  );
}
ok(`sonda subida con la llave secreta (PNG de ${SONDA.length} bytes)`);

try {
  /* 2 · LA COMPROBACIÓN QUE IMPORTA: sin credencial, tiene que fallar -------- */
  const anonima = await fetch(rutaObjeto);
  if (anonima.status === 200) {
    mal(
      'un GET SIN FIRMAR devolvió 200 sobre un objeto que existe: la evidencia está ' +
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
      `no se pudo firmar una URL: ${await detalleDe(firma)} — el bucket es inalcanzable ` +
        'también para la API',
    );
  } else {
    const { signedURL } = await firma.json();
    const firmada = await fetch(`${url}/storage/v1${signedURL}`);
    if (!firmada.ok) {
      mal(
        `la URL firmada respondió ${await detalleDe(firmada)}: un bucket ilegible también ` +
          'es un fallo',
      );
    } else {
      // Se comparan los BYTES, no el texto: un binario leído como cadena se
      // corrompe al decodificarlo y la comparación fallaría por el motivo
      // equivocado.
      const devuelto = Buffer.from(await firmada.arrayBuffer());
      if (devuelto.equals(SONDA)) {
        ok('con URL firmada de 60 s, el objeto se lee byte a byte igual que se subió');
      } else {
        mal(
          `la URL firmada devolvió ${devuelto.length} bytes distintos de los ${SONDA.length} subidos`,
        );
      }
    }
  }
} finally {
  /* 4 · limpiar, pase lo que pase -------------------------------------------- */
  const borrado = await fetch(rutaObjeto, { method: 'DELETE', headers: conLlave }).catch(
    () => null,
  );
  if (borrado !== null && borrado.ok) {
    ok('sonda borrada');
  } else {
    const motivo = borrado === null ? 'no hubo respuesta' : await detalleDe(borrado);
    console.error(
      `  ! no se pudo borrar la sonda (${motivo}): bórrala a mano → ${bucket}/${objeto}`,
    );
  }
}

console.log(
  process.exitCode === 1
    ? '\n✗ el bucket de evidencia NO está en condiciones. Arregla lo marcado antes de seguir.\n'
    : '\n✓ bucket privado verificado por ejercicio: escribe con llave, niega sin firma, sirve con firma.\n',
);
