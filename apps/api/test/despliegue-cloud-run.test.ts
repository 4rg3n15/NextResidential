import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  SECRETAS,
  banderaDeSecretos,
  cargar,
  comoYaml,
  leerSecretos,
  leerVariables,
  problemas,
  sustituir,
  variablesDeclaradas,
} from '../../../scripts/lib/despliegue-cloud-run.mjs';
import { cargarConfiguracion } from '../src/configuracion/esquema';

/**
 * D-154 · la configuración de Cloud Run sale de dos ficheros versionados sin
 * valores reales (`apps/api/cloud-run/`). Se prueba lo que el flujo de
 * despliegue hace con ellos, y que lo que resulta ARRANCA la API de verdad.
 */
const RAIZ = join(__dirname, '..', '..', '..');

/** Lo que Argenis carga como variables del repositorio en GitHub (marcadores). */
const DE_GITHUB = {
  NCR_SUPABASE_URL: 'https://ref.supabase.co',
  NCR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_de-prueba',
  NCR_CORS_ALLOWED_ORIGINS: 'https://consola.ejemplo.co',
  NCR_SUPABASE_POOLER_MAX_CLIENTES: '15',
};

/** Lo que Cloud Run monta desde Secret Manager (valores de prueba). */
const DE_SECRET_MANAGER: Record<string, string> = {
  SUPABASE_SECRET_KEY: 'sb_secret_de-prueba',
  DATABASE_URL: 'postgresql://app_api.ref:clave@pooler.ejemplo.co:5432/postgres',
  DATABASE_POOLER_URL: 'postgresql://app_api.ref:clave@pooler.ejemplo.co:6543/postgres',
  INGESTA_FIRMA_SECRETO: 'secreto-de-ingesta-de-treinta-y-dos-o-mas',
  BIOMETRIA_LLAVE: 'llave-de-biometria-de-treinta-y-dos-o-mas',
  EQUIPOS_LLAVE: 'llave-de-equipos-de-treinta-y-dos-o-mas++',
  API_IP_FIRMA_SECRETO: 'secreto-compartido-con-la-consola-32+++',
};

describe('D-154 · los ficheros versionados de Cloud Run', () => {
  it('cuadran con .env.example: nada inventado, nada secreto como variable, nada obligatorio fuera', () => {
    const { variables, secretos } = cargar(RAIZ);
    expect(variables.size).toBeGreaterThan(0);
    expect(secretos.size).toBe(7);
    for (const nombre of variables.keys()) expect(SECRETAS).not.toContain(nombre);
  });

  it('lo que resulta de sustituir + los secretos ARRANCA la configuración real de la API', () => {
    const { variables, secretos } = cargar(RAIZ);
    const entorno = Object.fromEntries(sustituir(variables, DE_GITHUB));
    for (const variable of secretos.keys()) {
      const valor = DE_SECRET_MANAGER[variable];
      expect(valor, `falta el valor de prueba de ${variable}`).toBeDefined();
      entorno[variable] = valor as string;
    }
    const config = cargarConfiguracion(entorno);
    expect(config.NODE_ENV).toBe('production');
    expect(config.API_PROXIES_DE_CONFIANZA).toBe('1');
    expect(config.SUPABASE_JWKS_URL).toBe('https://ref.supabase.co/auth/v1/.well-known/jwks.json');
    expect(config.PROVEEDOR_DE_EQUIPOS).toBe('simulado');
  });

  it('el valor de --set-secrets es VARIABLE=secreto:latest, sin valores', () => {
    const { secretos } = cargar(RAIZ);
    const bandera = banderaDeSecretos(secretos);
    expect(bandera.split(',')).toHaveLength(7);
    for (const parte of bandera.split(','))
      expect(parte).toMatch(/^[A-Z][A-Z0-9_]*=[a-z0-9-]+:latest$/);
  });
});

describe('D-154 · lo que el guion rechaza', () => {
  const declaradas = variablesDeclaradas('A=\nB=\n# C=x\nSUPABASE_SECRET_KEY=\n');

  it('declara también las comentadas del ejemplo', () => {
    expect([...declaradas].sort()).toEqual(['A', 'B', 'C', 'SUPABASE_SECRET_KEY']);
  });

  it('una variable que el ejemplo no declara, una secreta como normal y una repetida en los dos', () => {
    const motivos = problemas(
      new Map([
        ['NO_EXISTE', 'x'],
        ['SUPABASE_SECRET_KEY', 'x'],
      ]),
      new Map([['SUPABASE_SECRET_KEY', 'ncr-x']]),
      declaradas,
    );
    expect(motivos).toEqual(
      expect.arrayContaining([
        'NO_EXISTE no está en apps/api/.env.example',
        'SUPABASE_SECRET_KEY es secreta: va en secretos.txt, no en variables.yaml',
        'SUPABASE_SECRET_KEY está en los dos ficheros',
        'BIOMETRIA_LLAVE la exige la API y no está en ningún fichero',
      ]),
    );
  });

  it('un marcador que no empieza por NCR_ no se sustituye con cualquier variable del entorno', () => {
    expect(problemas(new Map([['A', '${HOME}']]), new Map(), declaradas)).toContain(
      'A: el marcador ${HOME} no empieza por NCR_',
    );
  });

  it('un marcador sin valor, vacío o con comillas impide el despliegue y se nombra', () => {
    const v = new Map([
      ['A', '${NCR_UNO}'],
      ['B', '${NCR_DOS}/x'],
      ['C', '${NCR_TRES}'],
    ]);
    expect(() => sustituir(v, { NCR_UNO: '  ', NCR_TRES: 'a"b' })).toThrow(
      'faltan, vacías o con comillas: NCR_DOS, NCR_TRES, NCR_UNO',
    );
    expect(comoYaml(sustituir(v, { NCR_UNO: '1', NCR_DOS: 'h', NCR_TRES: 't' }))).toBe(
      'A: "1"\nB: "h/x"\nC: "t"\n',
    );
  });

  it('forma estricta: YAML anidado, valor sin comillas, secreto con nombre inválido, duplicados', () => {
    expect(() => leerVariables('A: 1')).toThrow('variables.yaml:1');
    expect(() => leerVariables(`A: "a'b"`)).toThrow('variables.yaml:1');
    expect([...leerVariables(`A: 'x'\nB: "y"`)]).toEqual([
      ['A', 'x'],
      ['B', 'y'],
    ]);
    expect(() => leerVariables('A: "1"\nA: "2"')).toThrow('A está dos veces');
    expect(() => leerSecretos('A=Mayusculas')).toThrow('secretos.txt:1');
    expect(() => leerSecretos('A=ncr-a\nA=ncr-b')).toThrow('A está dos veces');
  });
});
