import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppModule } from './app.module';
import type { Configuracion } from './configuracion/esquema';

const configuracionParaContrato: Configuracion = {
  NODE_ENV: 'development',
  PORT: 3000,
  SUPABASE_URL: 'https://generacion-de-contrato.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'no-aplica',
  SUPABASE_SECRET_KEY: 'no-aplica',
  SUPABASE_JWKS_URL: 'https://generacion-de-contrato.invalid/auth/v1/jwks',
  MFA_OBLIGATORIO: true,
  JWKS_CACHE_TTL_SEGUNDOS: 600,
  JWKS_REFRESCO_MINIMO_SEGUNDOS: 60,
  DATABASE_URL: 'no-aplica',
  DATABASE_POOLER_URL: 'no-aplica',
  INGESTA_FIRMA_SECRETO: 'no-aplica-para-la-generacion-del-contrato',
  BIOMETRIA_LLAVE: 'llave-solo-para-generar-el-contrato-32+',
  BIOMETRIA_LLAVE_REF: 'env:BIOMETRIA_LLAVE',
  BIOMETRIA_PLAZO_CONSENTIMIENTO_HORAS: 24,
  INGESTA_VENTANA_SEGUNDOS: 300,
  LIMITE_PAYLOAD: '256kb',
  THROTTLE_TTL_SEGUNDOS: 60,
  THROTTLE_LIMITE: 120,
  THROTTLE_DISPOSITIVO_LIMITE: 120,
  THROTTLE_INGESTA_IP_LIMITE: 3000,
  origenesPermitidos: ['https://generacion-de-contrato.invalid'],
};

/**
 * ORDEN CANÓNICO DEL DOCUMENTO.
 *
 * Swagger emite las rutas en el orden en que Nest registró los módulos. Mover
 * el puerto de auditoría a `NucleoModule` —para que la API arrancara en
 * producción— cambió ese orden y produjo un diff de 238 líneas **sin un solo
 * cambio de contrato**: las mismas 35 rutas, el mismo contenido, otra
 * posición. El control de desfase, que compara byte a byte, lo denunció como
 * si la API hubiera cambiado.
 *
 * Un artefacto cuyo orden depende del orden de registro de módulos no es
 * comparable byte a byte, y un control que denuncia un reordenamiento como
 * cambio de contrato entrena a ignorarlo. Se ordenan `paths`, las colecciones
 * de `components` y `tags`: a partir de aquí el fichero depende solo de la
 * FORMA de la API.
 */
const ordenadas = <T>(objeto: Record<string, T>): Record<string, T> =>
  Object.fromEntries(
    Object.keys(objeto)
      .sort()
      .map((clave) => [clave, objeto[clave] as T]),
  );

/**
 * Genera el contrato OpenAPI a fichero. Es la fuente del cliente Dart y del
 * cliente de la consola, que §2.6 exige GENERADOS y nunca escritos a mano.
 */
async function generar(): Promise<void> {
  // El contrato se genera sin depender de un `.env` real: la forma de la API no
  // cambia con la configuración, y exigir credenciales para generarla ataría la
  // generación del cliente Dart a tener acceso al proyecto (§2.6).
  const app = await NestFactory.create(AppModule.conConfiguracion(configuracionParaContrato), {
    logger: false,
  });
  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Next Control Residencial — API')
      .setDescription('Next Control decide. El hardware ejecuta.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  documento.paths = ordenadas(documento.paths);
  if (documento.components !== undefined) {
    const componentes = documento.components as Record<string, unknown>;
    for (const grupo of Object.keys(componentes)) {
      const contenido = componentes[grupo];
      if (contenido !== null && typeof contenido === 'object' && !Array.isArray(contenido)) {
        componentes[grupo] = ordenadas(contenido as Record<string, unknown>);
      }
    }
  }
  if (Array.isArray(documento.tags)) {
    documento.tags = [...documento.tags].sort((a, b) => a.name.localeCompare(b.name));
  }

  // `NCR_DESTINO_OPENAPI` permite escribir a un temporal sin tocar el árbol:
  // lo usa `scripts/lib/contrato-desfasado.mjs` para comparar sin modificar
  // nada, que es la disciplina que ya siguen las pruebas negativas.
  const destino =
    process.env.NCR_DESTINO_OPENAPI ??
    resolve(__dirname, '../../../packages/contracts/openapi.json');
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, JSON.stringify(documento, null, 2));
  await app.close();
  console.log(`OpenAPI escrito en ${destino}`);
}

generar().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
