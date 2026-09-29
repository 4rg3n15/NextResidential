/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C6 (ETAPA 15-M) · LOS EQUIPOS DEL REGISTRO DE LA CONSOLA, PARA LOS GUIONES DE SITIO
 *
 * Hasta aquí `pnpm sitio:ensayo` y la puesta en marcha leían UN equipo por
 * familia de `BARRERA_*`, `TERMINAL_*` y `VIDEOPORTERO_*`. Con N equipos de
 * cada tipo eso no escala, y contradice la regla del cliente: nada obliga a
 * tocar el .env en sitio. Aquí se leen los equipos ACTIVOS de la tabla
 * `dispositivos` —los que la consola dio de alta— con su credencial DESCIFRADA
 * por la misma bóveda que usa la API (`EQUIPOS_LLAVE`: HKDF por copropiedad y
 * propósito, AES-256-GCM), tal como hace `RegistroDeEquiposPg`.
 *
 * La RLS está forzada también para el dueño (ADR-05): cada lectura lleva
 * claims. `dispositivos` se lee con los del superadministrador; el sobre de la
 * credencial SÓLO con los de SERVICIO de su copropiedad (política de 0032).
 * La credencial vive en memoria el tiempo del guion y NUNCA se imprime: toda
 * línea del guion pasa por el tachado de secretos.
 *
 * Las variables del .env quedan de RESPALDO: se usan sólo si la base no está
 * al alcance o el registro no tiene equipos con usuario y credencial.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createDecipheriv, hkdfSync } from 'node:crypto';

/** Los propósitos de la bóveda, idénticos a `sobre-aes-gcm.ts` de la API. */
const PROPOSITOS = {
  credencialesDeEquipo: 'ncr:credenciales-de-equipo:v1',
  secretoDeAlarmServer: 'ncr:secreto-de-alarm-server:v1',
};
const LONGITUD_IV = 12;
const LONGITUD_ETIQUETA = 16;

/** Tipo de la consola → familia del ensayo. Relé y controlador no se ensayan. */
const FAMILIA_POR_TIPO = {
  camara_lpr: 'camara',
  terminal_facial: 'terminal',
  intercom: 'videoportero',
};

const CLAIMS_DE_LECTURA = JSON.stringify({ rol: 'superadministrador' });
const claimsDeServicio = (copropiedadId) =>
  JSON.stringify({
    rol: 'servicio',
    usuario_id: '00000000-0000-4000-8000-00000000f00d',
    copropiedad_id: copropiedadId,
    copropiedades: [copropiedadId],
  });

const derivarLlave = (maestra, copropiedadId, proposito) =>
  Buffer.from(hkdfSync('sha256', maestra, copropiedadId, proposito, 32));

const descifrar = (llave, { iv, etiqueta, cuerpo }) => {
  const d = createDecipheriv('aes-256-gcm', llave, iv);
  d.setAuthTag(etiqueta);
  return Buffer.concat([d.update(cuerpo), d.final()]).toString('utf8');
};

const desaplanar = (plano) => ({
  iv: plano.subarray(0, LONGITUD_IV),
  etiqueta: plano.subarray(LONGITUD_IV, LONGITUD_IV + LONGITUD_ETIQUETA),
  cuerpo: plano.subarray(LONGITUD_IV + LONGITUD_ETIQUETA),
});

const conClaims = async (pool, claims, fn) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN READ ONLY');
    await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
};

/**
 * Los equipos del registro con su credencial descifrada, en la forma que
 * `ensayarEquipo` espera (`EquipoDeEnsayo`) más `nombre`, `copropiedad`,
 * `dispositivoId` y, para la cámara, `secretoDeAlarmServer` (el propio, si lo
 * emitió el alta). Los que no tienen usuario o sobre se devuelven en
 * `incompletos`, con el motivo, para que el guion lo diga y no los ensaye.
 */
export const equiposDelRegistro = async (
  pool,
  llaveMaestra,
  { puertoRtsp = 554, tiempoLimiteMs = 5000 } = {},
) => {
  const filas = await conClaims(pool, CLAIMS_DE_LECTURA, async (c) => {
    const { rows } = await c.query(
      `SELECT d.id, d.copropiedad_id, c.nombre AS copropiedad, d.nombre, d.tipo::text AS tipo,
              d.host, d.puerto, d.protocolo::text AS protocolo, d.usuario, d.canal_barrera,
              d.numero_de_puerta, d.canal_de_audio, d.canal_de_video,
              d.secreto_alarm_server_sobre
         FROM public.dispositivos d JOIN public.copropiedades c ON c.id = d.copropiedad_id
        WHERE d.estado = 'activo' AND d.tipo IN ('camara_lpr', 'terminal_facial', 'intercom')
        ORDER BY c.nombre, d.tipo, d.nombre`,
    );
    return rows;
  });
  const equipos = [];
  const incompletos = [];
  for (const f of filas) {
    const familia = FAMILIA_POR_TIPO[f.tipo];
    if (f.usuario === null || f.usuario === '') {
      incompletos.push({ nombre: f.nombre, motivo: 'sin usuario de servicio en la ficha' });
      continue;
    }
    const sobre = await conClaims(pool, claimsDeServicio(f.copropiedad_id), async (c) => {
      const { rows } = await c.query(
        `SELECT iv, cuerpo, etiqueta FROM public.credenciales_de_equipo
          WHERE dispositivo_id = $1 AND copropiedad_id = $2 AND estado = 'activo'`,
        [f.id, f.copropiedad_id],
      );
      return rows[0] ?? null;
    });
    if (sobre === null) {
      incompletos.push({
        nombre: f.nombre,
        motivo: 'sin credencial guardada: edítela en la consola',
      });
      continue;
    }
    let clave;
    try {
      clave = descifrar(
        derivarLlave(llaveMaestra, f.copropiedad_id, PROPOSITOS.credencialesDeEquipo),
        sobre,
      );
    } catch {
      incompletos.push({
        nombre: f.nombre,
        motivo: 'la credencial no se descifra con EQUIPOS_LLAVE',
      });
      continue;
    }
    let secretoDeAlarmServer = null;
    if (f.secreto_alarm_server_sobre !== null) {
      try {
        secretoDeAlarmServer = descifrar(
          derivarLlave(llaveMaestra, f.copropiedad_id, PROPOSITOS.secretoDeAlarmServer),
          desaplanar(f.secreto_alarm_server_sobre),
        );
      } catch {
        secretoDeAlarmServer = null;
      }
    }
    const puerta =
      familia === 'camara'
        ? f.canal_barrera
        : familia === 'terminal'
          ? f.numero_de_puerta
          : f.canal_de_audio;
    equipos.push({
      familia,
      dispositivoId: f.id,
      copropiedadId: f.copropiedad_id,
      copropiedad: f.copropiedad,
      nombre: f.nombre,
      host: f.host,
      puerto: Number(f.puerto),
      protocolo: f.protocolo,
      usuario: f.usuario,
      clave,
      puerta: puerta === null ? 1 : Number(puerta),
      canalDeVideo: f.canal_de_video ?? '102',
      puertoRtsp,
      tiempoLimiteMs,
      secretoDeAlarmServer,
    });
  }
  return { equipos, incompletos };
};
