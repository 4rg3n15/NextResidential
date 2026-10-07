/**
 * Lo que se sabe de un consentimiento biométrico antes de ser agregado: sus
 * estados, canales y orígenes, y los datos con que nace. Vive aparte del
 * agregado (`consentimiento.ts`) para que éste siga leyéndose de una vez; se
 * reexporta desde allí, así que nadie importa este fichero directamente.
 */
export const ESTADOS_CONSENTIMIENTO = [
  'pendiente',
  'vigente',
  'rechazado',
  'revocado',
  'expirado',
] as const;
export type EstadoConsentimiento = (typeof ESTADOS_CONSENTIMIENTO)[number];

export const CANALES = ['app', 'sms', 'correo', 'whatsapp', 'presencial'] as const;
export type CanalConsentimiento = (typeof CANALES)[number];

/**
 * Quién dejó constancia del consentimiento.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ETAPA 15-L (F4) · DOS ORÍGENES, Y NO SE CONFUNDEN — decisión del cliente
 *
 * El cliente decidió que la única constancia obligatoria sea una casilla en el
 * formulario de la autorización: «El visitante autorizó el uso de su foto para
 * el ingreso». Quien la marca es quien REGISTRA (residente, portero,
 * administración), no el titular. Eso no se disfraza de lo que no es: el
 * consentimiento lleva su ORIGEN, y uno `declarado_por_quien_registra` nunca
 * pasa por `otorgar()` ni se confunde con uno `otorgado_por_el_titular`. La
 * regla de titularidad sigue intacta para todo lo demás —otorgar, rechazar y
 * revocar siguen siendo del titular—; lo que se añade es una declaración con
 * autor, momento y versión del texto (ADR-032, riesgo legal aceptado por el
 * cliente). Si el titular está presente, puede CONFIRMARLO él mismo
 * (`confirmarPorElTitular`, D-10): entonces el origen pasa a ser el suyo.
 *
 * 15-X · D3 (ADR-039) · TERCER ORIGEN: el REPRESENTANTE LEGAL de un menor de 15
 * a 17 años. La ley pone esa figura (Ley 1581, art. 7: el dato de un menor lo
 * autoriza su representante, oído el menor), y se nombra como tal: nace con
 * `autorizarComoRepresentanteLegal`, con su origen y su autor —la cuenta del
 * titular del hogar—, y sólo un representante la retira por su lado
 * (`revocarComoRepresentanteLegal`). `revocar` sigue siendo del titular, y el
 * consentimiento PROPIO de un titular no lo toca ningún representante. A los 18
 * el titular la confirma él mismo, como una declaración (D-10).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const ORIGENES_DE_CONSENTIMIENTO = [
  'otorgado_por_el_titular',
  'declarado_por_quien_registra',
  'autorizado_por_representante_legal',
] as const;
export type OrigenDeConsentimiento = (typeof ORIGENES_DE_CONSENTIMIENTO)[number];

/** Lo que se sabe de una declaración: quién marcó la casilla, cuándo y sobre qué texto. */
export interface DatosDeDeclaracion {
  readonly id: string;
  readonly copropiedadId: string;
  readonly titularId: string;
  readonly finalidad: string;
  /** La versión del TEXTO de la casilla que se marcó. */
  readonly versionPolitica: string;
  readonly canal: CanalConsentimiento;
  /** La cuenta que marcó la casilla. Nunca vacía. */
  readonly declaradoPor: string;
  readonly ahora: Date;
}

export interface DatosConsentimiento {
  readonly id: string;
  readonly copropiedadId: string;
  /** El TITULAR. No hay campo para quien lo invita: RN-10, D-08. */
  readonly titularId: string;
  readonly finalidad: string;
  readonly versionPolitica: string;
  readonly canal: CanalConsentimiento;
  readonly solicitadoEn: Date;
  readonly otorgadoEn?: Date | null;
  readonly revocadoEn?: Date | null;
  readonly evidenciaId?: string | null;
  readonly estado?: EstadoConsentimiento;
  /** F4 · por omisión, del titular: es lo que había antes de la 15-L. */
  readonly origen?: OrigenDeConsentimiento;
  /** F4 · quién marcó la casilla, si el origen es la declaración. */
  readonly declaradoPor?: string | null;
}

/**
 * 15-X · D3 · la autorización del REPRESENTANTE LEGAL de un menor de 15 a 17
 * años (Ley 1581, art. 7): la cuenta del titular del hogar que la dio, cuándo y
 * sobre qué versión del texto. Que lo sea —titular del hogar, menor de ESA
 * vivienda, en edad— lo comprueba la aplicación; aquí, que tenga autor.
 */
export interface DatosDeRepresentacion {
  readonly id: string;
  readonly copropiedadId: string;
  /** El MENOR: es su dato. */
  readonly titularId: string;
  readonly finalidad: string;
  readonly versionPolitica: string;
  readonly canal: CanalConsentimiento;
  /** La cuenta del representante. Nunca vacía, nunca el propio menor. */
  readonly representanteId: string;
  readonly ahora: Date;
}
