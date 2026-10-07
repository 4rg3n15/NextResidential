import type { INestApplication } from '@nestjs/common';
import express from 'express';
import { BITACORA, GENERADOR_DE_ID } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId } from '@ncr/domain-core';
import {
  guardarCuerpoCrudo,
  LIMITE_DE_FOTOGRAFIA,
  RUTA_DE_FOTOGRAFIA_DE_VISITANTE,
} from '../autorizaciones';
import { RUTAS_CON_FOTO_DE_VISITA } from '../visitas';
import { RUTAS_CON_FOTO_DE_ROSTRO } from '../residente';
import { acumularSobreCrudo, RUTA_DE_ALARM_SERVER } from '../comun/sobre-de-equipo';
import { LIMITE_DE_TROZO_DE_AUDIO, RUTA_DE_AUDIO_DE_INTERCOM } from '../comun/ruta-de-audio';
import { LIMITE_DE_OFERTA_SDP, RUTA_DE_WHEP_DE_VIDEO, TIPO_SDP } from '../comun/ruta-de-video';
import { aplicarContextoDePeticion } from '../comun/contexto/contexto-de-peticion';
import { FiltroGlobalDeExcepciones } from '../comun/filtros/filtro-global';
import { InterceptorDeCorrelacion } from '../comun/interceptores/correlacion';
import { InterceptorDeReintentoDeLecturas } from '../comun/interceptores/reintento-de-lecturas';
import { InterceptorDeLatencias, REPORTE_DE_ERRORES } from '../observabilidad';
import type { ReporteDeErrores } from '../observabilidad';
import type { Configuracion } from '../configuracion/esquema';
import { aplicarSaneamiento, aplicarSeguridad } from '../seguridad';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA TUBERÍA HTTP DEL DESPLIEGUE, EN UN SOLO SITIO · V1 (15-N)
 *
 * Hasta la 15-N, `main.ts` la montaba a mano y el banco de pruebas
 * (`test/utilidades.ts`) la COPIABA línea a línea, con un comentario que pedía
 * mantenerlas iguales. Es la familia de H-13-11: lo que el banco no monta, el
 * banco no prueba. Y el defecto del video en vivo vivía justo en esa tubería
 * —el saneamiento le quitaba el CRLF final a la oferta SDP—, así que una prueba
 * extremo a extremo tenía que recorrer LA MISMA función que el despliegue, no
 * una réplica. `main.ts` y el banco llaman a esta.
 *
 * El orden es parte del contrato, y cada paso dice por qué va donde va:
 *
 *  1. Contexto de petición, EL PRIMERO: todo lo que corre después queda dentro
 *     del `AsyncLocalStorage` y sus registros llevan la correlación (ETAPA 14).
 *  2. Seguridad (§2.7): cabeceras, CORS, `ValidationPipe`, límites.
 *  3. Los cuerpos que NO son JSON, cada uno sólo bajo su ruta y ANTES de
 *     `express.json` (que dejaría el flujo sin consumir): el sobre del servidor
 *     de alarma, el audio del operador, la oferta SDP y las fotografías.
 *  4. JSON y formularios, con `verify` para guardar el cuerpo CRUDO (la firma
 *     del Alarm Server se calcula sobre los bytes que llegaron, RNF-03.11).
 *  5. Saneamiento DESPUÉS de los parsers: antes no hay cuerpo que sanear. Las
 *     rutas de formato (SDP, audio) quedan marcadas y no se tocan (V1).
 *  6. Filtro global de excepciones e interceptores de correlación y latencia.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const montarTuberiaHttp = (app: INestApplication, config: Configuracion): void => {
  aplicarContextoDePeticion(app, () => app.get<GeneradorDeId>(GENERADOR_DE_ID).nuevo());

  aplicarSeguridad(app, config);

  app.use(RUTA_DE_ALARM_SERVER, acumularSobreCrudo);
  // A4 · el audio del operador, crudo y acotado, sólo bajo su ruta.
  app.use(
    RUTA_DE_AUDIO_DE_INTERCOM,
    express.raw({ type: 'application/octet-stream', limit: LIMITE_DE_TROZO_DE_AUDIO }),
  );
  // A5 · la oferta SDP del navegador, como texto y acotada, sólo bajo su ruta.
  app.use(RUTA_DE_WHEP_DE_VIDEO, express.text({ type: TIPO_SDP, limit: LIMITE_DE_OFERTA_SDP }));
  // O3 · la fotografía del visitante: más que el tope general, SÓLO en su ruta.
  app.use(
    RUTA_DE_FOTOGRAFIA_DE_VISITANTE,
    express.json({ limit: LIMITE_DE_FOTOGRAFIA, verify: guardarCuerpoCrudo }),
  );
  // F (15-L) · «Generar autorización» lleva la foto en el cuerpo: mismo tope.
  // 15-X · y el rostro del residente y el del menor.
  for (const ruta of [...RUTAS_CON_FOTO_DE_VISITA, ...RUTAS_CON_FOTO_DE_ROSTRO]) {
    app.use(ruta, express.json({ limit: LIMITE_DE_FOTOGRAFIA, verify: guardarCuerpoCrudo }));
  }
  app.use(express.json({ limit: config.LIMITE_PAYLOAD, verify: guardarCuerpoCrudo }));
  app.use(express.urlencoded({ limit: config.LIMITE_PAYLOAD, extended: false }));

  aplicarSaneamiento(app);

  app.useGlobalFilters(
    new FiltroGlobalDeExcepciones(
      app.get<Bitacora>(BITACORA),
      app.get<ReporteDeErrores>(REPORTE_DE_ERRORES),
    ),
  );
  // Correlación primero, latencias después: el cronómetro se lee en el log de
  // la misma petición que lo produjo.
  // 15-O · el reintento de lecturas va DENTRO de los dos: una lectura
  // reintentada es UNA petición, con una correlación y una latencia.
  app.useGlobalInterceptors(
    app.get(InterceptorDeCorrelacion),
    app.get(InterceptorDeLatencias),
    new InterceptorDeReintentoDeLecturas(app.get<Bitacora>(BITACORA)),
  );
};
