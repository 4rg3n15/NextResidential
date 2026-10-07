import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, expect } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { Configuracion } from '../src/configuracion/esquema';
import { ADMINISTRADOR_DE_CUENTAS, PROVEEDOR_DE_IDENTIDAD } from '../src/cuentas';
import { VERSION_DE_LA_POLITICA_DE_DATOS } from '../src/cuentas/aplicacion/politica-de-datos';
import { DOMINIO_SINTETICO } from '../src/cuentas/dominio/correo-sintetico';
import { crearApp, crearFirmante, tokenDe } from './utilidades';
import { ProveedorDeIdentidadFalso } from './dobles/proveedor-de-identidad';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL BANCO DE LA RONDA 15-W CONTRA LA BASE REAL
 *
 * Lo comparten las suites de la 15-W contra PostgreSQL. Es la cadena de
 * producción —controladores, casos de uso, adaptadores PostgreSQL, el GANCHO
 * de claims de la base y la RLS forzada—; sólo el proveedor de identidad es
 * falso, porque la suite no alcanza Supabase Auth.
 *
 * Vitest corre los ficheros en paralelo contra la misma base (H-15M-C01). Para
 * que ninguna suite falle por culpa de OTRA:
 *  · la sesión se abre con el proveedor falso y el correo sintético de la
 *    cuenta: `POST /auth/acceso` exige el código corto de la copropiedad, que
 *    `residentes-y-vehiculos-pg` cambia en COP_A mientras las demás corren;
 *  · quien registra cuentas lo hace en una COPROPIEDAD PROPIA: el código corto,
 *    el tope por omisión y la suspensión del registro son suyos;
 *  · cada registro sale de su propia IP de documentación (RFC 5737): el límite
 *    por IP tiene su prueba dedicada y no debe saltar aquí.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SUPER = '00000000-0000-4000-8000-000000000001';
export const INICIAL = 'Inicial#2026';
export const NUEVA = 'Hogar#2026xy';
export const POLITICA = VERSION_DE_LA_POLITICA_DE_DATOS;

type Metodo = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface Sesion {
  readonly usuarioId: string;
  readonly token: string;
}

export interface PerfilDeAdulto {
  readonly nombres: string;
  readonly apellidos: string;
  readonly tipoDocumento: 'cedula';
  readonly numeroDocumento: string;
  readonly telefono: string;
  readonly fechaNacimiento: string;
  readonly correo: string;
}

/** Lo que una suite añade al banco: equipos simulados y sus repositorios. */
export interface OpcionesDelBanco {
  readonly sustituir?: (b: TestingModuleBuilder) => TestingModuleBuilder;
  /** Con la base ya disponible y antes de levantar la aplicación. */
  readonly montar?: (pool: Pool) => Promise<{ readonly repositorio?: unknown } | undefined>;
  readonly configuracion?: Partial<Configuracion>;
}

let siguienteIp = 1;
/** Una IP de documentación distinta por petición (RFC 5737, 203.0.113.0/24 y vecinas). */
export const ipDePrueba = (): string => {
  const n = siguienteIp;
  siguienteIp += 1;
  const red = ['203.0.113', '198.51.100', '192.0.2'][Math.floor(n / 250) % 3] ?? '192.0.2';
  return `${red}.${String((n % 250) + 1)}`;
};

export class BancoDelHogar {
  constructor(private readonly opciones: OpcionesDelBanco = {}) {}

  disponible = false;
  readonly sufijo = `${String(Date.now()).slice(-6)}${String(randomInt(10))}`;
  private pool_: Pool | undefined;
  private app_: INestApplication | undefined;
  private proveedor_: ProveedorDeIdentidadFalso | undefined;
  private superadmin_ = '';

  get pool(): Pool {
    if (this.pool_ === undefined) throw new Error('el banco no tiene base');
    return this.pool_;
  }
  get app(): INestApplication {
    if (this.app_ === undefined) throw new Error('el banco no levantó la aplicación');
    return this.app_;
  }
  get proveedor(): ProveedorDeIdentidadFalso {
    if (this.proveedor_ === undefined) throw new Error('el banco no tiene proveedor');
    return this.proveedor_;
  }

  async levantar(): Promise<void> {
    if (URL_BASE === undefined) return;
    this.pool_ = new Pool({ connectionString: URL_BASE, max: 6 });
    try {
      // La 0056 es la última de esta ronda: sin ella, nada de esto existe.
      await this.pool_.query('SELECT tope_de_plazas FROM public.viviendas LIMIT 1');
      this.disponible = true;
    } catch {
      return;
    }
    const firmante = await crearFirmante();
    const pool = this.pool_;
    const proveedor = new ProveedorDeIdentidadFalso(firmante, async (authUserId) => {
      const { rows } = await pool.query<{ c: Record<string, unknown> }>(
        `SELECT public.custom_access_token_hook(jsonb_build_object('user_id', $1::text, 'claims', '{}'::jsonb)) -> 'claims' AS c`,
        [authUserId],
      );
      return rows[0]?.c ?? null;
    });
    this.proveedor_ = proveedor;
    const equipos = await this.opciones.montar?.(pool);
    const sustituir = this.opciones.sustituir ?? ((b: TestingModuleBuilder) => b);
    this.app_ = await crearApp(
      firmante,
      (b) =>
        sustituir(
          b
            .overrideProvider(PROVEEDOR_DE_IDENTIDAD)
            .useValue(proveedor)
            .overrideProvider(ADMINISTRADOR_DE_CUENTAS)
            .useValue(proveedor),
        ),
      {
        PERSISTENCIA_DE_EVENTOS: 'postgres',
        PERSISTENCIA_DE_BIOMETRIA: 'postgres',
        DATABASE_URL: URL_BASE,
        DATABASE_POOLER_URL: URL_BASE,
        ...this.opciones.configuracion,
      },
      equipos,
    );
    this.superadmin_ = await tokenDe(firmante, {
      rol: 'superadministrador',
      copropiedadId: null,
      usuarioId: SUPER,
    });
  }

  async bajar(): Promise<void> {
    await this.app_?.close();
    await this.pool_?.end();
  }

  http() {
    return request(this.app.getHttpServer());
  }

  comoSuper(metodo: Metodo, ruta: string, cuerpo?: object) {
    const r = this.http()[metodo](ruta).set('Authorization', `Bearer ${this.superadmin_}`);
    return cuerpo === undefined ? r : r.send(cuerpo);
  }

  con(token: string, metodo: Metodo, ruta: string, cuerpo?: object) {
    const r = this.http()[metodo](ruta).set('Authorization', `Bearer ${token}`);
    return cuerpo === undefined ? r : r.send(cuerpo);
  }

  async uno<T extends object>(sql: string, p: unknown[]): Promise<T | undefined> {
    return (await this.pool.query<T>(sql, p)).rows[0];
  }

  /** Una copropiedad que nace en la prueba, con su código corto (único en la plataforma). */
  async copropiedadPropia(): Promise<{ readonly id: string; readonly codigo: string }> {
    const codigo = `W${String(randomInt(1_000_000)).padStart(6, '0')}`;
    const nit = `7${String(randomInt(100_000_000_000)).padStart(11, '0')}`;
    const fila = await this.uno<{ id: string }>(
      `INSERT INTO public.copropiedades (nombre, nit, codigo_corto, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4, $4) RETURNING id`,
      [`Hogar 15-W ${this.sufijo}`, nit, codigo, SUPER],
    );
    if (fila === undefined) throw new Error('la copropiedad propia no nació');
    return { id: fila.id, codigo };
  }

  /** Una vivienda activa y vacía. La monta el superusuario: no es lo probado. */
  async vivienda(copropiedadId: string, identificador: string, agrupacion = 'W'): Promise<string> {
    const fila = await this.uno<{ id: string }>(
      `INSERT INTO public.viviendas (copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4, $4) RETURNING id`,
      [copropiedadId, identificador, agrupacion, SUPER],
    );
    if (fila === undefined) throw new Error('la vivienda no nació');
    return fila.id;
  }

  /**
   * La sesión que emitiría Supabase Auth, con los claims del gancho de la base.
   * El correo sintético no se guarda (ADR-023): se deriva como lo hace la API.
   */
  async sesion(usuarioId: string, contrasena: string): Promise<string> {
    const cuenta = await this.uno<{ usuario: string; cop: string }>(
      'SELECT nombre_usuario AS usuario, copropiedad_id::text AS cop FROM public.usuarios WHERE id = $1',
      [usuarioId],
    );
    const correo = `${cuenta?.usuario ?? '-'}@${cuenta?.cop ?? '-'}.${DOMINIO_SINTETICO}`;
    const emitida = await this.proveedor.iniciarSesion(correo, contrasena);
    if (emitida === null) throw new Error(`sin sesión para ${usuarioId}`);
    return emitida.accessToken;
  }

  /** D1 · la administración crea al titular con su vivienda; cambia la contraseña. */
  async titular(copropiedadId: string, viviendaId: string, usuario: string): Promise<Sesion> {
    const alta = await this.comoSuper(
      'post',
      `/copropiedades/${copropiedadId}/residentes/cuentas`,
      {
        usuario,
        contrasenaInicial: INICIAL,
        nombre: `Titular ${usuario}`,
        viviendaId,
      },
    );
    expect(alta.status, JSON.stringify(alta.body)).toBe(201);
    const usuarioId = alta.body.usuarioId as string;
    const inicial = await this.sesion(usuarioId, INICIAL);
    const cambio = await this.con(inicial, 'post', '/auth/contrasena', {
      actual: INICIAL,
      nueva: NUEVA,
    });
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
    return { usuarioId, token: await this.sesion(usuarioId, NUEVA) };
  }

  perfil(n: number, nacimiento = '1988-03-14'): PerfilDeAdulto {
    return {
      nombres: `Adulto${String(n)}`,
      apellidos: `Prueba ${this.sufijo}`,
      tipoDocumento: 'cedula',
      numeroDocumento: `7${this.sufijo}${String(n)}`,
      telefono: `+57301${this.sufijo}`.slice(0, 13),
      fechaNacimiento: nacimiento,
      correo: `adulto${String(n)}.${this.sufijo}@correo.invalid`,
    };
  }

  /** D3 · el primer ingreso: sin vivienda ni código. */
  async completarAlta(copropiedadId: string, token: string, perfil: PerfilDeAdulto): Promise<void> {
    const r = await this.con(token, 'post', `/copropiedades/${copropiedadId}/mi/alta`, perfil);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.vinculada, JSON.stringify(r.body)).toBe(true);
  }

  /** D2 · «Crear cuenta» con un código de plaza, desde una IP propia. */
  registrar(cuerpo: Record<string, unknown>, ip = ipDePrueba()) {
    return this.http().post('/auth/registro').set('x-forwarded-for', ip).send(cuerpo);
  }

  cuerpoDeRegistro(usuario: string, codigo: string, nacimiento = '1990-05-17') {
    return {
      usuario,
      correo: `${usuario}@correo.invalid`,
      contrasena: NUEVA,
      confirmacion: NUEVA,
      codigoDeInvitacion: codigo,
      fechaNacimiento: nacimiento,
      aceptaTratamientoDeDatos: true,
      versionPolitica: POLITICA,
    };
  }

  async usuarioId(copropiedadId: string, usuario: string): Promise<string | undefined> {
    return (
      await this.uno<{ id: string }>(
        'SELECT id FROM public.usuarios WHERE copropiedad_id = $1 AND nombre_usuario = $2',
        [copropiedadId, usuario],
      )
    )?.id;
  }

  /** Un adulto más de la vivienda: crea su cuenta con el código y completa su alta. */
  async adultoConCodigo(
    copropiedadId: string,
    codigo: string,
    usuario: string,
    perfil: PerfilDeAdulto,
  ): Promise<Sesion> {
    const r = await this.registrar(this.cuerpoDeRegistro(usuario, codigo, perfil.fechaNacimiento));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const usuarioId = await this.usuarioId(copropiedadId, usuario);
    if (usuarioId === undefined) throw new Error(`la cuenta ${usuario} no existe`);
    const token = await this.sesion(usuarioId, NUEVA);
    await this.completarAlta(copropiedadId, token, perfil);
    return { usuarioId, token };
  }
}

/** Levanta el banco del fichero y registra el guardián: sin base, con `--con-base`, falla. */
export const bancoDelHogar = (motivo: string, opciones: OpcionesDelBanco = {}): BancoDelHogar => {
  const banco = new BancoDelHogar(opciones);
  beforeAll(async () => banco.levantar());
  afterAll(async () => banco.bajar());
  exigirBase(motivo, () => banco.disponible);
  return banco;
};
