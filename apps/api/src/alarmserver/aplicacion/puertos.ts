/**
 * Puertos del receptor de equipos, declarados por el CONSUMIDOR (§2.2).
 *
 * A2 (ETAPA 15-E) · la terminal reconoce un identificador de plantilla, no a
 * una persona. El ingestor necesita traducirlo para registrar el acceso a
 * nombre de alguien —`eventos.persona_id`— y no le importa quién lo haga: lo
 * satisface el módulo de biometría, y la raíz de composición los une.
 */
export interface ResolutorDeTitularBiometrico {
  /** La persona dueña de la plantilla, o `null` si Next Control no la gestiona. */
  titularDePlantilla(copropiedadId: string, plantillaId: string): Promise<string | null>;
}
