import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AlmacenEvidencia, Autorizacion, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { esExito, esFallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { CrearAutorizacion, RevocarAutorizacion } from './casos-de-uso';
import {
  AdjuntarFotografiaDeVisitante,
  MAX_BASE64_FOTOGRAFIA,
  SEGUNDOS_URL_FOTOGRAFIA,
  UrlDeFotografiaDeVisitante,
} from './fotografia-de-visitante';
import type { FotografiaDeVisitante, RepositorioAutorizaciones } from './puertos';

/**
 * La fotografía del visitante — O3, ADR-021. Lo que se demuestra aquí:
 *
 *  · el tipo se decide por los BYTES y no por lo que diga el cliente (§2.7.8);
 *  · el tope se aplica ANTES de decodificar;
 *  · lo que llega al repositorio es una referencia con hash, nunca los bytes;
 *  · la URL sale firmada y con vida corta, y jamás se guarda (RN-21, D-19).
 */
const COP = '11111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-24T14:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };
let contador = 0;
const ids: GeneradorDeId = { nuevo: () => `id-${(contador += 1)}` };

const ctx = (extra: Partial<ContextoTenant> = {}): ContextoTenant => ({
  usuarioId: 'usr-1',
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
  ...extra,
});

class RepoFalso implements RepositorioAutorizaciones {
  readonly guardadas = new Map<string, Autorizacion>();
  readonly fotografias = new Map<string, FotografiaDeVisitante>();
  async guardar(_c: string, a: Autorizacion): Promise<void> {
    this.guardadas.set(a.id, a);
  }
  async porId(_c: string, id: string): Promise<Autorizacion | null> {
    return this.guardadas.get(id) ?? null;
  }
  async vigentesDePersona(): Promise<readonly Autorizacion[]> {
    return [];
  }
  async activasParaLectura(): Promise<readonly Autorizacion[]> {
    return [];
  }
  async adjuntarFotografia(_c: string, id: string, f: FotografiaDeVisitante): Promise<boolean> {
    if (!this.guardadas.has(id)) return false;
    this.fotografias.set(id, f);
    return true;
  }
  async fotografiaDe(_c: string, id: string): Promise<FotografiaDeVisitante | null> {
    return this.fotografias.get(id) ?? null;
  }
}

class AlmacenFalso implements AlmacenEvidencia {
  readonly guardados: { clave: string; bytes: Uint8Array; tipoMime: string }[] = [];
  async guardar(clave: string, bytes: Uint8Array, tipoMime: string): Promise<string> {
    this.guardados.push({ clave, bytes, tipoMime });
    return clave;
  }
  async urlFirmada(clave: string, segundos: number): Promise<string> {
    return `https://firmada.local/${encodeURIComponent(clave)}?expira=${segundos}`;
  }
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const GIF = Buffer.from('GIF89a\u0000\u0000', 'latin1');

describe('AdjuntarFotografiaDeVisitante · tipo real, tope y referencia (O3, §2.7.8, RN-21)', () => {
  let repo: RepoFalso;
  let almacen: AlmacenFalso;
  let adjuntar: AdjuntarFotografiaDeVisitante;
  let autorizacionId: string;

  beforeEach(async () => {
    repo = new RepoFalso();
    almacen = new AlmacenFalso();
    adjuntar = new AdjuntarFotografiaDeVisitante(repo, reloj, almacen, ids);
    const creada = await new CrearAutorizacion(repo, reloj, ids).ejecutar(ctx(), {
      viviendaId: '22222222-2222-4222-8222-222222222222',
      personaId: '33333333-3333-4333-8333-333333333333',
      desde: '2026-09-24T00:00:00Z',
      hasta: '2026-09-25T00:00:00Z',
    });
    if (!esExito(creada)) throw new Error('no se pudo crear la autorización de prueba');
    autorizacionId = creada.valor.id;
  });

  it('un JPEG declarado JPEG se guarda bajo el tenant y se enlaza por REFERENCIA con hash', async () => {
    const r = await adjuntar.ejecutar(ctx(), autorizacionId, {
      contenidoBase64: JPEG.toString('base64'),
      tipoMime: 'image/jpeg',
    });
    expect(esExito(r) && r.valor).toEqual({ tipoMime: 'image/jpeg', tamanoBytes: JPEG.length });

    expect(almacen.guardados).toHaveLength(1);
    const guardado = almacen.guardados[0]!;
    expect(guardado.clave.startsWith(`visitantes/${COP}/${autorizacionId}/`)).toBe(true);
    expect(guardado.clave.endsWith('.jpg')).toBe(true);
    expect(guardado.tipoMime).toBe('image/jpeg');

    const referencia = repo.fotografias.get(autorizacionId);
    expect(referencia).toEqual({
      clave: guardado.clave,
      tipoMime: 'image/jpeg',
      hashSha256: createHash('sha256').update(JPEG).digest('hex'),
      tamanoBytes: JPEG.length,
    });
  });

  it('un PNG que dice ser JPEG se rechaza: el tipo lo dicen los bytes, no el cliente', async () => {
    const r = await adjuntar.ejecutar(ctx(), autorizacionId, {
      contenidoBase64: PNG.toString('base64'),
      tipoMime: 'image/jpeg',
    });
    expect(esFallo(r) && r.error.detalle).toMatch(/no coincide/);
    expect(almacen.guardados).toHaveLength(0);
  });

  it('un GIF no entra por ningún tipo declarado, y un tipo fuera de la lista tampoco', async () => {
    const gif = await adjuntar.ejecutar(ctx(), autorizacionId, {
      contenidoBase64: GIF.toString('base64'),
      tipoMime: 'image/png',
    });
    expect(esFallo(gif) && gif.error.detalle).toMatch(/bytes de cabecera/);
    const svg = await adjuntar.ejecutar(ctx(), autorizacionId, {
      contenidoBase64: Buffer.from('<svg/>').toString('base64'),
      tipoMime: 'image/svg+xml',
    });
    expect(esFallo(svg) && svg.error.detalle).toMatch(/JPEG o PNG/);
    expect(almacen.guardados).toHaveLength(0);
  });

  it('el tope se aplica sobre la cadena, ANTES de decodificar; y el vacío no cuenta', async () => {
    const enorme = 'A'.repeat(MAX_BASE64_FOTOGRAFIA + 4);
    const r = await adjuntar.ejecutar(ctx(), autorizacionId, {
      contenidoBase64: enorme,
      tipoMime: 'image/jpeg',
    });
    expect(esFallo(r) && r.error.detalle).toMatch(/1,5 MiB/);
    const vacio = await adjuntar.ejecutar(ctx(), autorizacionId, {
      contenidoBase64: '',
      tipoMime: 'image/jpeg',
    });
    expect(esFallo(vacio)).toBe(true);
    expect(almacen.guardados).toHaveLength(0);
  });

  it('sin autorización no hay carga; y a una revocada no se le adjunta nada', async () => {
    const ajena = await adjuntar.ejecutar(ctx(), 'no-existe', {
      contenidoBase64: JPEG.toString('base64'),
      tipoMime: 'image/jpeg',
    });
    expect(esFallo(ajena) && ajena.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');

    await new RevocarAutorizacion(repo, reloj).ejecutar(ctx(), autorizacionId, 'ya no viene');
    const revocada = await adjuntar.ejecutar(ctx(), autorizacionId, {
      contenidoBase64: JPEG.toString('base64'),
      tipoMime: 'image/jpeg',
    });
    expect(esFallo(revocada) && revocada.error.codigo).toBe('OPERACION_NO_PERMITIDA');
    expect(almacen.guardados).toHaveLength(0);
  });

  it('§2.7.6 · sin copropiedad alcanzable no se toca ni el almacén ni el repositorio', async () => {
    const r = await adjuntar.ejecutar(ctx({ copropiedadId: null }), autorizacionId, {
      contenidoBase64: JPEG.toString('base64'),
      tipoMime: 'image/jpeg',
    });
    expect(esFallo(r) && r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
    expect(almacen.guardados).toHaveLength(0);
  });

  it('la URL se firma en cada lectura con vida corta; sin fotografía es «no encontrada»', async () => {
    const url = new UrlDeFotografiaDeVisitante(repo, reloj, almacen);
    const sinFoto = await url.ejecutar(ctx(), autorizacionId);
    expect(esFallo(sinFoto) && sinFoto.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');

    await adjuntar.ejecutar(ctx(), autorizacionId, {
      contenidoBase64: JPEG.toString('base64'),
      tipoMime: 'image/jpeg',
    });
    const conFoto = await url.ejecutar(ctx(), autorizacionId);
    expect(esExito(conFoto) && conFoto.valor.expiraEnSegundos).toBe(SEGUNDOS_URL_FOTOGRAFIA);
    expect(esExito(conFoto) && conFoto.valor.url).toMatch(/^https:\/\/firmada\.local\//);
    expect(esExito(conFoto) && conFoto.valor.url).toContain(`expira=${SEGUNDOS_URL_FOTOGRAFIA}`);
  });
});
