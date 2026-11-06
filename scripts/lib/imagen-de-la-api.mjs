#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA IMAGEN DE LA API, COMPROBADA ANTES DE PUBLICARLA · D-154 (ADR-040)
 *
 *   node scripts/lib/imagen-de-la-api.mjs <imagen>
 *
 * Sobre la imagen YA construida (`docker build -f apps/api/Dockerfile …`):
 *
 *  1. el Node de dentro es EXACTAMENTE el de `.nvmrc`;
 *  2. el proceso no corre como root, y no puede reescribir su propio código;
 *  3. ningún `.env*`, llave o credencial de cuenta de servicio dentro (los
 *     certificados de las CA del sistema, en /etc/ssl, sí: son públicos);
 *  4. el tamaño: sin comprimir, por debajo de 250 MB (la meta de D-154);
 *     comprimido —lo que guarda y cobra Artifact Registry—, se informa.
 *
 * Lo usan el trabajo `imagen-de-la-api` de la verificación (cada PR) y el flujo
 * de despliegue (antes del `push`). Sólo necesita `docker`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOPE_SIN_COMPRIMIR_MB = 250;

/** Rutas que la imagen nunca debe traer. `find` de busybox (alpine). */
export const BUSCAR_PROHIBIDOS =
  'find / -xdev \\( -path /proc -o -path /sys -o -path /etc/ssl -o -path /usr/share/ca-certificates \\) -prune -o ' +
  "-type f \\( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' -o -name 'service-account*.json' \\) -print";

/** Los juicios, puros: reciben lo medido y devuelven los motivos de fallo. */
export const juzgar = ({
  nodeDeLaImagen,
  nvmrc,
  usuario,
  prohibidos,
  sinComprimirMb,
  codigoEscribible,
}) => {
  const motivos = [];
  if (codigoEscribible) motivos.push('el usuario del proceso puede reescribir el código de la API');
  if (nodeDeLaImagen !== `v${nvmrc}`)
    motivos.push(`la imagen trae Node ${nodeDeLaImagen}, y .nvmrc dice v${nvmrc}`);
  if (usuario === '' || usuario === 'root' || usuario === '0' || usuario.startsWith('0:'))
    motivos.push(`el proceso corre como root (USER «${usuario}»)`);
  for (const ruta of prohibidos) motivos.push(`la imagen trae ${ruta}`);
  if (sinComprimirMb >= TOPE_SIN_COMPRIMIR_MB)
    motivos.push(
      `pesa ${String(sinComprimirMb)} MB sin comprimir (tope ${String(TOPE_SIN_COMPRIMIR_MB)})`,
    );
  return motivos;
};

const docker = (args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
/** Se INSPECCIONA como root (`--user 0`) para poder leerlo todo; se ejecuta como `node`. */
const enLaImagen = (imagen, guion) =>
  docker([
    'run',
    '--rm',
    '--network',
    'none',
    '--user',
    '0',
    '--entrypoint',
    'sh',
    imagen,
    '-c',
    guion,
  ]);

const esPrincipal =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const imagen = process.argv[2];
  if (imagen === undefined) {
    console.error('uso: imagen-de-la-api.mjs <imagen>');
    process.exit(2);
  }
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const medido = {
    nodeDeLaImagen: enLaImagen(imagen, 'node -v'),
    nvmrc: readFileSync(join(raiz, '.nvmrc'), 'utf8').trim(),
    usuario: docker(['image', 'inspect', '--format', '{{.Config.User}}', imagen]),
    prohibidos: enLaImagen(imagen, BUSCAR_PROHIBIDOS)
      .split('\n')
      .filter((l) => l !== ''),
    // Como el usuario de la imagen, no como root: ¿puede tocar dist/main.js?
    codigoEscribible:
      docker([
        'run',
        '--rm',
        '--network',
        'none',
        '--entrypoint',
        'sh',
        imagen,
        '-c',
        'if [ -w dist/main.js ] || [ -w dist ]; then echo si; else echo no; fi',
      ]) === 'si',
    // `du -k` es POSIX (busybox incluido): kilobytes de lo que hay en el disco de la imagen.
    sinComprimirMb: Math.round(Number(enLaImagen(imagen, 'du -sxk / | cut -f1')) / 1024),
  };
  const motivos = juzgar(medido);
  console.log(
    `imagen de la API: Node ${medido.nodeDeLaImagen} · usuario ${medido.usuario} · ` +
      `${String(medido.sinComprimirMb)} MB sin comprimir (tope ${String(TOPE_SIN_COMPRIMIR_MB)})`,
  );
  if (motivos.length > 0) {
    for (const m of motivos) console.error(`FALLO imagen-de-la-api: ${m}`);
    process.exit(1);
  }
}
