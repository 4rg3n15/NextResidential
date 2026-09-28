/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `pnpm sitio:ensayo` · LAS COMPROBACIONES DEL MAC Y DE LA PLATAFORMA (J1, 15-L)
 *
 * Salen del guion para que éste no crezca con cada comprobación nueva.
 *
 *  · Del Mac (informativas, como hasta ahora): la API por el bucle local y por
 *    la IP del Mac (la del iPhone), el puente de video y las migraciones.
 *  · De la plataforma (corrección de la 15-L), que CUENTAN en el veredicto: el
 *    proveedor de equipos frente a los equipos reales dados de alta (F3) y la
 *    conexión de pg-boss (C1). El juicio es del paquete de equipos —funciones
 *    puras y probadas—; aquí sólo se leen el `.env` y la base.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { join } from 'node:path';
import { ipDelMac } from './red-del-mac.mjs';
import {
  equiposRealesRegistrados,
  migracionesPendientes,
  sondearSalud,
} from './ensayo-plataforma.mjs';

export const comprobacionesDelMac = async ({ pool, decir, raiz }) => {
  decir('── Comprobaciones del Mac');
  const puerto = process.env.PORT || '3000';
  const ip = ipDelMac();
  const local = await sondearSalud(`http://127.0.0.1:${puerto}/health`);
  decir(
    local.ok
      ? `  ✓ API en marcha: http://127.0.0.1:${puerto}/health`
      : `  ✗ la API no contesta en http://127.0.0.1:${puerto}/health (${local.motivo ?? `HTTP ${local.estado}`})` +
          ' → arránquela: pnpm --filter @ncr/api start',
  );
  if (ip === null) {
    decir('  ✗ el Mac no tiene IP en ninguna red → conéctelo a la Wi-Fi o al cable de los equipos');
  } else {
    const porIp = await sondearSalud(`http://${ip}:${puerto}/health`);
    decir(
      porIp.ok
        ? `  ✓ la API contesta por la IP del Mac: http://${ip}:${puerto}/health`
        : local.ok
          ? `  ✗ la API contesta en el Mac pero NO por su IP (${ip}): cortafuegos del Mac → ` +
            'Ajustes del Sistema → Red → Cortafuegos → permitir conexiones entrantes de «node»'
          : `  ✗ tampoco por la IP del Mac (${ip})`,
    );
    decir(
      `  ▶ iPhone: datos móviles apagados, misma Wi-Fi, y en Safari abra http://${ip}:${puerto}/health`,
    );
    decir(
      '    Si Safari no la abre, el problema es la red, no la app (docs/guias/APP_EN_IPHONE.md §1)',
    );
  }
  const go2rtc = process.env.GO2RTC_URL ?? '';
  if (go2rtc === '') {
    decir('  ✗ GO2RTC_URL vacía: sin video en vivo → GO2RTC_URL=http://127.0.0.1:1984');
  } else {
    const g = await sondearSalud(`${go2rtc.replace(/\/$/, '')}/api`);
    decir(
      g.alcanzada
        ? '  ✓ puente de video (go2rtc) en marcha'
        : '  ✗ go2rtc no contesta → pnpm sitio:video',
    );
  }
  if (pool === null) {
    decir('  · sin DATABASE_URL: no se comprueban migraciones ni eventos de la plataforma');
    return;
  }
  try {
    const pendientes = await migracionesPendientes(pool, join(raiz, 'supabase/migrations'));
    decir(
      pendientes === null
        ? '  · la base no lleva el registro de migraciones de la CLI: compruébelo con supabase migration list'
        : pendientes.length === 0
          ? '  ✓ la base tiene todas las migraciones del repositorio'
          : `  ✗ faltan ${pendientes.length} migraciones → supabase db push (${pendientes.join(', ')})`,
    );
  } catch (error) {
    decir(`  ✗ no se pudo leer la base: ${error.message}`);
  }
};

/**
 * F3 y C1 · el juicio del paquete sobre el `.env` de la API (y la base, si la
 * hay). `equiposReales` es `null` cuando no se pudo preguntar a la base.
 */
export const comprobacionesDeLaPlataforma = async ({ P, entorno, pool }) => {
  const equiposReales =
    pool === null ? null : await equiposRealesRegistrados(pool).catch(() => null);
  return [P.juzgarProveedorDeEquipos(entorno, equiposReales), P.juzgarConexionDePgBoss(entorno)];
};
