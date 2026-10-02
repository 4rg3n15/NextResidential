import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirBase } from '../sqlite/esquema';
import type { BaseSqlite } from '../sqlite/motor';
import { RegistroCifrado, llaveDeEquipos } from './registro-cifrado';
import type { EquipoDelPuente } from './registro-cifrado';

/**
 * 15-Q2 · D1 · las credenciales de los equipos viven SÓLO en el Edge, y
 * cifradas: AES-256-GCM con el `dispositivo_id` como dato asociado, y la llave
 * fuera de SQLite. Un volcado del fichero sin la llave no dice nada.
 */
const CAMARA = '90000000-0000-4000-8000-000000000001';
const TERMINAL = '90000000-0000-4000-8000-000000000002';
const CLAVE_EN_CLARO = 'clave-del-equipo-que-no-debe-verse-en-disco';
const HOST = 'camara-cifrada.simulado.invalid';
const SECRETO_ALARMA = 'secreto-de-la-camara-hacia-el-edge-sin-valor-alguno';
const AHORA = new Date('2026-10-01T10:00:00.000Z');

const camara = (cambios: Partial<EquipoDelPuente> = {}): EquipoDelPuente => ({
  dispositivoId: CAMARA,
  tipo: 'camara_lpr',
  host: HOST,
  puerto: 80,
  protocolo: 'http',
  usuario: 'servicio',
  clave: CLAVE_EN_CLARO,
  secretoAlarmServer: SECRETO_ALARMA,
  ...cambios,
});

const terminal: EquipoDelPuente = {
  dispositivoId: TERMINAL,
  tipo: 'terminal_facial',
  host: '203.0.113.20',
  puerto: 8080,
  protocolo: 'https',
  usuario: 'servicio',
  clave: 'otra-clave-de-equipo-de-prueba',
};

const directorios: string[] = [];
const abiertas: BaseSqlite[] = [];

const enDisco = () => {
  const dir = mkdtempSync(join(tmpdir(), 'registro-cifrado-'));
  directorios.push(dir);
  const ruta = join(dir, 'edge.sqlite');
  const abrir = (): BaseSqlite => {
    const db = abrirBase(ruta);
    abiertas.push(db);
    return db;
  };
  /** Los bytes crudos del fichero y de su WAL: lo que vería quien se lleve el disco. */
  const bytes = (): string =>
    [ruta, `${ruta}-wal`]
      .filter((f) => existsSync(f))
      .map((f) => readFileSync(f).toString('latin1'))
      .join('');
  return { ruta, abrir, bytes };
};

afterEach(() => {
  for (const db of abiertas.splice(0)) {
    try {
      db.close();
    } catch {
      // ya cerrada por la prueba
    }
  }
  for (const dir of directorios.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('RegistroCifrado · lo que se guarda se recupera', () => {
  it('guardar, buscar y todos, y al reabrir con la misma llave sigue ahí', async () => {
    const disco = enDisco();
    const llave = randomBytes(32);
    const registro = new RegistroCifrado(disco.abrir(), llave);
    expect(await registro.buscar(CAMARA)).toBeNull();
    registro.guardar(camara(), AHORA);
    registro.guardar(terminal, AHORA);
    expect(await registro.buscar(CAMARA)).toEqual(camara());
    expect(
      registro
        .todos()
        .map((e) => e.dispositivoId)
        .sort(),
    ).toEqual([CAMARA, TERMINAL]);

    const reabierto = new RegistroCifrado(disco.abrir(), llave);
    expect(await reabierto.buscar(CAMARA)).toEqual(camara());
    expect(await reabierto.buscar(TERMINAL)).toEqual(terminal);
  });

  it('guardar otra vez sustituye la fila (una por equipo) con un IV nuevo', async () => {
    const disco = enDisco();
    const llave = randomBytes(32);
    const db = disco.abrir();
    const registro = new RegistroCifrado(db, llave);
    const iv = (): string =>
      Buffer.from(
        (db.prepare('SELECT iv FROM equipos_cifrados').get() as { iv: Uint8Array }).iv,
      ).toString('hex');
    registro.guardar(camara(), AHORA);
    const primero = iv();
    registro.guardar(camara({ clave: 'clave-corregida-de-prueba' }), AHORA);
    expect(iv()).not.toBe(primero);
    expect(db.prepare('SELECT COUNT(*) AS n FROM equipos_cifrados').get()).toEqual({ n: 1 });
    expect((await new RegistroCifrado(disco.abrir(), llave).buscar(CAMARA))?.clave).toBe(
      'clave-corregida-de-prueba',
    );
  });

  it('retirar lo saca de la memoria y de la base', async () => {
    const disco = enDisco();
    const llave = randomBytes(32);
    const registro = new RegistroCifrado(disco.abrir(), llave);
    registro.guardar(camara(), AHORA);
    registro.guardar(terminal, AHORA);
    registro.retirar(CAMARA);
    registro.retirar('equipo-que-no-existe');
    expect(await registro.buscar(CAMARA)).toBeNull();
    const reabierto = new RegistroCifrado(disco.abrir(), llave);
    expect(reabierto.todos().map((e) => e.dispositivoId)).toEqual([TERMINAL]);
  });
});

describe('RegistroCifrado · lo que hay en disco no dice nada sin la llave', () => {
  it('ni la clave, ni el host, ni el secreto del receptor aparecen en el fichero ni en su WAL', () => {
    const disco = enDisco();
    const db = disco.abrir();
    new RegistroCifrado(db, randomBytes(32)).guardar(camara(), AHORA);
    const mientrasVive = disco.bytes();
    db.close();
    const trasCerrar = disco.bytes();
    for (const volcado of [mientrasVive, trasCerrar]) {
      expect(volcado).not.toContain(CLAVE_EN_CLARO);
      expect(volcado).not.toContain(HOST);
      expect(volcado).not.toContain(SECRETO_ALARMA);
    }
    // Lo único en claro es el identificador del equipo: es la clave primaria.
    expect(mientrasVive + trasCerrar).toContain(CAMARA);
  });

  it('con otra llave no arranca: lanza al leer, no devuelve basura', () => {
    const disco = enDisco();
    new RegistroCifrado(disco.abrir(), randomBytes(32)).guardar(camara(), AHORA);
    expect(() => new RegistroCifrado(disco.abrir(), randomBytes(32))).toThrow(/EDGE_EQUIPOS_LLAVE/);
  });

  it('sin filas, cualquier llave abre un registro vacío', () => {
    const disco = enDisco();
    expect(new RegistroCifrado(disco.abrir(), randomBytes(32)).todos()).toEqual([]);
  });

  it('una fila copiada sobre la de otro equipo no descifra: el dispositivo es dato asociado', () => {
    const disco = enDisco();
    const llave = randomBytes(32);
    const db = disco.abrir();
    const registro = new RegistroCifrado(db, llave);
    registro.guardar(camara(), AHORA);
    registro.guardar(terminal, AHORA);
    db.prepare(
      `UPDATE equipos_cifrados SET
         iv = (SELECT iv FROM equipos_cifrados WHERE dispositivo_id = ?),
         etiqueta = (SELECT etiqueta FROM equipos_cifrados WHERE dispositivo_id = ?),
         cuerpo = (SELECT cuerpo FROM equipos_cifrados WHERE dispositivo_id = ?)
       WHERE dispositivo_id = ?`,
    ).run(CAMARA, CAMARA, CAMARA, TERMINAL);
    expect(() => new RegistroCifrado(disco.abrir(), llave)).toThrow();
  });
});

describe('llaveDeEquipos · EDGE_EQUIPOS_LLAVE', () => {
  it('32 bytes en base64 se aceptan', () => {
    const llave = randomBytes(32);
    expect(llaveDeEquipos(llave.toString('base64')).equals(llave)).toBe(true);
  });

  it.each([
    ['vacía', ''],
    ['16 bytes', randomBytes(16).toString('base64')],
    ['31 bytes', randomBytes(31).toString('base64')],
    ['33 bytes', randomBytes(33).toString('base64')],
    ['texto que no es base64', 'esto no es una llave'],
  ])('%s se rechaza', (_caso, valor) => {
    expect(() => llaveDeEquipos(valor)).toThrow('EDGE_EQUIPOS_LLAVE debe ser 32 bytes en base64');
  });
});
