import { Documento, NombreDePersona, Placa } from '@ncr/domain-core';
import { esExito, recortarEtiqueta } from '@ncr/domain-core';
import type { RepositorioPadron } from './puertos';
import type { LectorDeVocabulario } from './vocabulario';
import { VOCABULARIO_SIN_CONFIGURAR } from './vocabulario';
import type { ContextoTenant } from '../../autenticacion';

/**
 * Carga de padrón desde archivo (HU-03).
 *
 * El caso de uso trabaja sobre FILAS ya extraídas, no sobre bytes. El análisis
 * del formato es un adaptador: hoy hay uno de CSV, y XLSX entra como otro sin
 * tocar esta lógica. Separarlo importa por seguridad además de por diseño —
 * un analizador binario es superficie de ataque y merece su propia revisión
 * (§2.7.8, validación por tipo real).
 *
 * **D-72 · la hoja se llena con lo que el conjunto tiene escrito, no con
 * UUIDs.** La versión anterior exigía las columnas `vivienda_id` y `persona_id`
 * con identificadores internos: una hoja que nadie podía rellenar, porque esos
 * valores solo existen dentro de la base. Ahora la vivienda se nombra como se
 * la nombra en la portería —«Casa 12»— y la persona por documento y nombre. Un
 * UUID sigue siendo aceptable en esas mismas columnas: quien exporte del
 * sistema y vuelva a cargar no tiene por qué traducir nada.
 */
export interface FilaPadron {
  readonly numeroDeFila: number;
  /** Identificador visible de la vivienda («42», «101») o su UUID. */
  readonly vivienda: string;
  /**
   * Torre, bloque, manzana, sección o sector. Desde la migración `0029` forma
   * parte de la identidad de la vivienda, así que una hoja de apartamentos sin
   * esta columna es ambigua: el 101 de la Torre 1 y el de la Torre 2 son dos
   * viviendas distintas. Si la copropiedad no agrupa, la columna sobra.
   */
  readonly agrupacion?: string;
  readonly placa?: string;
  /** Documento de la persona, tal como se escribe: se normaliza al resolver. */
  readonly documento?: string;
  readonly tipoDocumento?: string;
  readonly nombre?: string;
  /** UUID de una persona ya existente; alternativa a documento + nombre. */
  readonly personaId?: string;
  readonly esTitular?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ErrorDeFila {
  readonly numeroDeFila: number;
  readonly motivo: string;
}

export interface ResultadoCarga {
  readonly aceptadas: number;
  readonly errores: readonly ErrorDeFila[];
  readonly aplicada: boolean;
  /**
   * Cuántas viviendas y personas hubo que CREAR. No es adorno: la hoja nombra
   * la vivienda por su identificador, así que una errata crea una vivienda que
   * nadie quería. Con el número a la vista, «esperaba 30 y creó 31» se ve en el
   * momento; sin él, la errata se descubre semanas después.
   */
  readonly viviendasCreadas: number;
  readonly personasCreadas: number;
  /**
   * Cuántos identificadores traían la palabra dentro —«Casa 42»— y se
   * guardaron sin ella. **Se recorta y se cuenta, no se rechaza**: el archivo
   * es el que el conjunto ya tenía, y negarse a leerlo por una palabra que
   * sabemos quitar convertiría la vía más rápida de cargar el padrón en la más
   * lenta. Contarlo es lo que impide que el recorte sea silencioso.
   */
  readonly identificadoresRecortados: number;
}

interface FilaValidada {
  readonly fila: FilaPadron;
  readonly placa?: Placa;
  readonly documento?: Documento;
  readonly nombre?: string;
}

export class CargarPadronDesdeArchivo {
  constructor(
    private readonly repo: RepositorioPadron,
    private readonly vocabulario: LectorDeVocabulario,
  ) {}

  /**
   * Valida **todas** las filas antes de escribir ninguna, y aborta la
   * transacción entera si alguna falla. Una carga parcial es peor que ninguna:
   * el administrador no sabe qué entró, y reintentar duplica lo que sí pasó.
   */
  async ejecutar(ctx: ContextoTenant, filas: readonly FilaPadron[]): Promise<ResultadoCarga> {
    const errores: ErrorDeFila[] = [];
    const validas: FilaValidada[] = [];

    for (const fila of filas) {
      const error = (motivo: string): void => {
        errores.push({ numeroDeFila: fila.numeroDeFila, motivo });
      };

      if (fila.vivienda.trim() === '') {
        error('la columna «vivienda» va vacía');
        continue;
      }

      let placa: Placa | undefined;
      if (fila.placa !== undefined) {
        const r = Placa.crear(fila.placa);
        if (!esExito(r)) {
          error(r.error.detalle);
          continue;
        }
        placa = r.valor;
      }

      // Persona: por documento + nombre —lo que el conjunto tiene escrito— o
      // por identificador, para quien recarga lo que exportó del sistema.
      let documento: Documento | undefined;
      let nombre: string | undefined;
      if (fila.documento !== undefined) {
        const d = Documento.crear(fila.tipoDocumento ?? 'cedula', fila.documento);
        if (!esExito(d)) {
          error(d.error.detalle);
          continue;
        }
        const n = NombreDePersona.crear(fila.nombre ?? '');
        if (!esExito(n)) {
          error('la fila trae documento pero no un nombre válido en la columna «nombre»');
          continue;
        }
        documento = d.valor;
        nombre = n.valor.valor;
      } else if (fila.nombre !== undefined && fila.personaId === undefined) {
        error('la fila trae nombre pero no documento: sin documento no hay identidad (RN-06)');
        continue;
      }

      validas.push({
        fila,
        ...(placa === undefined ? {} : { placa }),
        ...(documento === undefined ? {} : { documento }),
        ...(nombre === undefined ? {} : { nombre }),
      });
    }

    if (errores.length > 0 || !ctx.copropiedadId) {
      return {
        aceptadas: 0,
        errores,
        aplicada: false,
        viviendasCreadas: 0,
        personasCreadas: 0,
        identificadoresRecortados: 0,
      };
    }

    const copropiedadId = ctx.copropiedadId;
    let viviendasCreadas = 0;
    let personasCreadas = 0;
    let identificadoresRecortados = 0;

    // La etiqueta se lee UNA vez por carga, no una por fila: son 5 000 filas
    // como mucho y sería la misma respuesta 5 000 veces.
    const vocabulario =
      (await this.vocabulario.leer(ctx, copropiedadId)) ?? VOCABULARIO_SIN_CONFIGURAR;
    try {
      const aceptadas = await this.repo.enTransaccion(async (repo) => {
        // Las cachés no son una optimización: sin ellas, treinta filas de la
        // misma casa harían treinta resoluciones y —peor— treinta intentos de
        // alta que la base tendría que rechazar uno a uno.
        const viviendas = new Map<string, string>();
        const personas = new Map<string, string>();

        const resolverVivienda = async (fila: FilaPadron): Promise<string> => {
          // NFC también aquí (H-13-16): una hoja de cálculo guardada en macOS
          // trae los acentos DESCOMPUESTOS, así que la misma vivienda escrita
          // por la pantalla y por el archivo daría dos filas distintas.
          const escrito = fila.vivienda.normalize('NFC').trim();
          if (UUID.test(escrito)) return escrito;

          // «Casa 42» en la hoja se guarda como «42»: la palabra es de la
          // copropiedad y se pinta al mostrar (H-3). Se cuenta para que el
          // recorte conste en el informe de la carga.
          const recortado = recortarEtiqueta(escrito, vocabulario.etiquetaVivienda);
          const identificador = recortado ?? escrito;
          if (recortado !== null) identificadoresRecortados += 1;

          const agrupacionEscrita = fila.agrupacion?.normalize('NFC').trim();
          const agrupacion =
            agrupacionEscrita === undefined || agrupacionEscrita === ''
              ? null
              : (recortarEtiqueta(agrupacionEscrita, vocabulario.etiquetaAgrupacion) ??
                agrupacionEscrita);

          // La clave de la caché es el PAR, no el número: desde la 0029 el 101
          // de la Torre 1 y el de la Torre 2 son dos viviendas distintas, y una
          // caché por número las confundiría en la misma carga.
          const clave = JSON.stringify([agrupacion ?? '', identificador]);
          const enCache = viviendas.get(clave);
          if (enCache !== undefined) return enCache;

          const existente = await repo.buscarViviendaPorIdentificador(
            copropiedadId,
            agrupacion,
            identificador,
          );
          if (existente !== null) {
            viviendas.set(clave, existente.id);
            return existente.id;
          }
          const creada = await repo.registrarVivienda({
            copropiedadId,
            identificador,
            agrupacion,
            actorId: ctx.usuarioId,
          });
          if (creada.tipo !== 'registrada') {
            throw new ErrorDeCarga(
              fila.numeroDeFila,
              `no se pudo crear la vivienda «${identificador}»`,
            );
          }
          viviendasCreadas += 1;
          viviendas.set(clave, creada.id);
          return creada.id;
        };

        const resolverPersona = async (v: FilaValidada): Promise<string | null> => {
          if (v.documento === undefined) return v.fila.personaId ?? null;
          const clave = v.documento.toString();
          const enCache = personas.get(clave);
          if (enCache !== undefined) return enCache;
          // Idempotente por documento: el documento ES la identidad (RN-06), y
          // la misma persona en dos filas resuelve a la misma fila.
          const r = await repo.registrarPersona({
            copropiedadId,
            documento: v.documento,
            nombreCompleto: v.nombre ?? '',
            actorId: ctx.usuarioId,
          });
          if (r.tipo === 'registrada') personasCreadas += 1;
          personas.set(clave, r.id);
          return r.id;
        };

        let n = 0;
        for (const validada of validas) {
          const { fila, placa } = validada;
          const viviendaId = await resolverVivienda(fila);
          const personaId = await resolverPersona(validada);

          if (placa !== undefined) {
            const r = await repo.registrarVehiculo({
              copropiedadId,
              viviendaId,
              personaId,
              placa,
              actorId: ctx.usuarioId,
            });
            // Un choque de placa dentro de una carga masiva aborta la carga:
            // aceptar el resto dejaría al operador creyendo que entró completa.
            if (r.tipo !== 'registrado') {
              throw new ErrorDeCarga(fila.numeroDeFila, `placa ${placa} ya activa`);
            }
          } else if (personaId !== null) {
            const r = await repo.registrarResidente({
              copropiedadId,
              viviendaId,
              personaId,
              esTitular: fila.esTitular ?? false,
              actorId: ctx.usuarioId,
            });
            if (!r) throw new ErrorDeCarga(fila.numeroDeFila, 'residente duplicado');
          }
          // Una fila con solo la vivienda es válida y significa «da de alta
          // esta casa»: es como se registra un padrón que todavía no tiene a
          // nadie dentro.
          n += 1;
        }
        return n;
      });
      return {
        aceptadas,
        errores: [],
        aplicada: true,
        viviendasCreadas,
        personasCreadas,
        identificadoresRecortados,
      };
    } catch (e) {
      if (e instanceof ErrorDeCarga) {
        return {
          aceptadas: 0,
          errores: [{ numeroDeFila: e.fila, motivo: e.motivo }],
          aplicada: false,
          viviendasCreadas: 0,
          personasCreadas: 0,
          identificadoresRecortados: 0,
        };
      }
      throw e;
    }
  }
}

export class ErrorDeCarga extends Error {
  constructor(
    readonly fila: number,
    readonly motivo: string,
  ) {
    super(`fila ${fila}: ${motivo}`);
    this.name = 'ErrorDeCarga';
  }
}

/**
 * Analizador CSV. Deliberadamente pequeño y sin dependencias: admite comillas
 * dobles y separador `,`, y **rechaza** lo que no entiende en vez de adivinar.
 * Un CSV mal interpretado mete placas en la columna equivocada sin avisar.
 */
export const analizarCsv = (contenido: string): FilaPadron[] => {
  const lineas = contenido
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lineas.length < 2) return [];
  const cabeceras = partir(lineas[0]!).map((c) => c.trim().toLowerCase());
  const idx = (n: string): number => cabeceras.indexOf(n);
  const filas: FilaPadron[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const celdas = partir(lineas[i]!);
    const leer = (n: string): string | undefined => {
      const j = idx(n);
      const v = j >= 0 ? celdas[j]?.trim() : undefined;
      return v && v.length > 0 ? v : undefined;
    };
    filas.push(filaDesdeCeldas(i + 1, leer));
  }
  return filas;
};

/**
 * Traduce las columnas de la hoja a una fila del caso de uso. Vive aquí y no en
 * cada adaptador para que CSV y XLSX no acepten cabeceras distintas: dos
 * lectores con dos vocabularios son dos formatos, y el operador se entera al
 * tercer intento fallido.
 *
 * **Las columnas son las del archivo que el administrador ya tiene** —
 * `identificador`, `agrupacion`, `documento`, `tipo_documento`, `nombre`,
 * `placa`, `es_titular`—, y son exactamente las que produce la exportación:
 * si el círculo no cerrara, una de las dos estaría mal (D-72).
 *
 * `vivienda`, `vivienda_id` y `persona_id` se siguen leyendo como sinónimos
 * opcionales: quien exportó del sistema antes de este cambio no tiene que
 * traducir nada.
 */
/**
 * **Las columnas del padrón, en una sola lista.**
 *
 * La lee el importador —abajo— y la escribe el exportador
 * (`exportar-padron.ts`). Que sea la misma constante es lo que hace que el
 * archivo exportado vuelva a entrar sin editarlo: dos listas escritas aparte
 * son dos formatos esperando a divergir, y el operador se entera al tercer
 * intento fallido.
 *
 * Son las columnas que un administrador tiene en SU archivo. Ningún
 * identificador interno (D-72).
 */
export const COLUMNAS_DEL_PADRON = [
  'identificador',
  'agrupacion',
  'documento',
  'tipo_documento',
  'nombre',
  'placa',
  'es_titular',
] as const;

export const filaDesdeCeldas = (
  numeroDeFila: number,
  leer: (columna: string) => string | undefined,
): FilaPadron => {
  const vivienda = leer('identificador') ?? leer('vivienda') ?? leer('vivienda_id') ?? '';
  const agrupacion = leer('agrupacion');
  const placa = leer('placa');
  const documento = leer('documento');
  const tipoDocumento = leer('tipo_documento');
  const nombre = leer('nombre');
  const personaId = leer('persona_id');
  const esTitular = leer('es_titular');
  return {
    numeroDeFila,
    vivienda,
    ...(agrupacion === undefined ? {} : { agrupacion }),
    ...(placa === undefined ? {} : { placa }),
    ...(documento === undefined ? {} : { documento }),
    ...(tipoDocumento === undefined ? {} : { tipoDocumento }),
    ...(nombre === undefined ? {} : { nombre }),
    ...(personaId === undefined ? {} : { personaId }),
    ...(esTitular === undefined ? {} : { esTitular: esTitular.toLowerCase() === 'true' }),
  };
};

const partir = (linea: string): string[] => {
  const celdas: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!;
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else actual += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ',') {
      celdas.push(actual);
      actual = '';
    } else actual += c;
  }
  celdas.push(actual);
  return celdas;
};
