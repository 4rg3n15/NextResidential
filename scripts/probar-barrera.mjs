#!/usr/bin/env node
/**
 * PUNTO DE CONTROL 1 · que el relé responda, antes que nada.
 *
 * Abre la talanquera UNA vez con el adaptador que YA existe
 * (`ControlDeBarreraVehicular`, ruta capturada el 15/09/2026), contra el equipo
 * real que describa su `.env`. No reimplementa nada: si esto abre, el adaptador
 * de la ETAPA 11-A sigue siendo correcto contra este firmware; si no abre, todo
 * lo demás de la sesión sobra.
 *
 * NO lleva ninguna dirección ni credencial: las lee de las variables
 * BARRERA_HOST / BARRERA_PUERTO / BARRERA_USUARIO / BARRERA_CLAVE, que viven
 * solo en el `.env` local (§2.7.1, KPI-11).
 *
 *   node --env-file=apps/api/.env scripts/probar-barrera.mjs           # abrir
 *   node --env-file=apps/api/.env scripts/probar-barrera.mjs cerrar
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const compilado = join(raiz, 'packages/providers/dist/index.js');
if (!existsSync(compilado)) {
  console.error('FALTA la compilación de @ncr/providers. Ejecute antes:');
  console.error('  pnpm --filter @ncr/providers build');
  process.exit(2);
}

const { crearControlDeBarreraDesdeEntorno, ConfiguracionDeBarreraIncompleta } = createRequire(
  import.meta.url,
)(compilado);

const accion = (process.argv[2] ?? 'abrir').toLowerCase();
const ACCIONES = ['abrir', 'cerrar', 'bloquear', 'desbloquear'];
if (!ACCIONES.includes(accion)) {
  console.error(`Acción desconocida: ${accion}. Use ${ACCIONES.join(', ')}.`);
  process.exit(2);
}

let control;
try {
  control = crearControlDeBarreraDesdeEntorno();
} catch (error) {
  if (error instanceof ConfiguracionDeBarreraIncompleta) {
    console.error(`Configuración a medias: faltan ${error.faltantes.join(', ')}`);
    process.exit(2);
  }
  throw error;
}

if (control === null) {
  console.error('No hay equipo configurado: defina BARRERA_HOST, BARRERA_USUARIO y BARRERA_CLAVE');
  console.error('en apps/api/.env y vuelva a ejecutar con --env-file=apps/api/.env');
  process.exit(2);
}

console.log(`Equipo: ${control.destino}`);
console.log(`Orden:  ${accion}\n`);

// `abrir`/`cerrar` son PULSO; `bloquear`/`desbloquear` son ESTADO PERSISTENTE
// (H-3). Son dos métodos del puerto a propósito: con la barrera bloqueada, una
// orden de abrir se acepta y el relé no se mueve.
const esBloqueo = accion === 'bloquear' || accion === 'desbloquear';
const resultado = esBloqueo
  ? await control.fijarBloqueo('prueba-en-sitio', accion === 'bloquear')
  : await control.accionar('prueba-en-sitio', accion === 'abrir');

console.log(`Resultado: ${resultado.estado}`);
console.log(`Latencia:  ${resultado.latenciaMs} ms`);
if (resultado.motivo) console.log(`Motivo:    ${resultado.motivo}`);

console.log('');
if (resultado.estado === 'aceptada') {
  console.log('✓ El equipo ACEPTÓ la orden.');
  console.log('  H-1: «aceptada» NO es «abierta». Mire la talanquera: si no se movió,');
  console.log('  está BLOQUEADA. Desbloquéela con:');
  console.log('    node --env-file=apps/api/.env scripts/probar-barrera.mjs desbloquear');
  process.exit(0);
}
console.log('✗ El relé NO respondió como se esperaba. Esto es el PUNTO DE CONTROL 1:');
console.log('  si no se resuelve, el resto de la sesión no tiene sentido.');
process.exit(1);
