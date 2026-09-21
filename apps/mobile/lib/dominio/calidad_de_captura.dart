/// Validación de calidad de la captura facial, ANTES de enviarla.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ SE JUZGA AQUÍ Y NO EN EL SERVIDOR
///
/// HU-13 y CA-08 piden que la app valide encuadre, nitidez, iluminación y que
/// haya un solo rostro **antes del envío**. No es una optimización de red: es
/// que el residente está delante de la persona a la que está fotografiando y
/// puede repetir la foto en ese momento. Una validación que solo ocurre en el
/// servidor llega cuando el visitante ya se fue, y entonces la autorización
/// queda sin plantilla y nadie se entera hasta que el visitante no puede entrar.
///
/// El servidor **también** valida (KPI-16), y debe: esta comprobación se puede
/// saltar con un cliente modificado. Lo de aquí es para la persona, lo de allí
/// para el sistema.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// ESTO NO MIDE: JUZGA
///
/// Las cuatro medidas las produce la cámara —nitidez por varianza del
/// laplaciano, luminancia media, rostros detectados, caja del rostro sobre el
/// encuadre—. Aquí solo se comparan con los umbrales, porque así se puede
/// probar cada rama sin cámara y sin foto: el mismo motivo por el que el motor
/// de reglas recibe el contexto en vez de consultarlo.
///
/// Los umbrales viven en un sitio y tienen nombre. Repartidos por la pantalla
/// serían números mágicos que nadie vuelve a tocar.
library;

/// Lo que la cámara midió. Todo normalizado a 0..1 salvo el conteo de rostros.
class MedidasDeCaptura {
  const MedidasDeCaptura({
    required this.nitidez,
    required this.iluminacion,
    required this.rostrosDetectados,
    required this.proporcionRostro,
  });

  /// 0 = borrosa, 1 = perfectamente nítida.
  final double nitidez;

  /// 0 = negra, 0,5 = bien expuesta, 1 = quemada.
  final double iluminacion;

  final int rostrosDetectados;

  /// Cuánto del encuadre ocupa el rostro. Ni muy lejos ni pegado al objetivo.
  final double proporcionRostro;
}

/// Motivos por los que una captura NO sirve. Tipados, como todo lo que el
/// sistema rechaza: una cadena de texto no se puede traducir ni contar.
enum FalloDeCalidad {
  borrosa,
  oscura,
  quemada,
  sinRostro,
  variosRostros,
  demasiadoLejos,
  demasiadoCerca,
}

/// Umbrales, con nombre y en un solo sitio.
class UmbralesDeCalidad {
  const UmbralesDeCalidad({
    this.nitidezMinima = 0.45,
    this.iluminacionMinima = 0.25,
    this.iluminacionMaxima = 0.85,
    this.proporcionMinima = 0.15,
    this.proporcionMaxima = 0.75,
  });

  final double nitidezMinima;
  final double iluminacionMinima;
  final double iluminacionMaxima;
  final double proporcionMinima;
  final double proporcionMaxima;
}

/// Qué le decimos a quien sostiene el teléfono. En imperativo y sin jerga:
/// «acérquese» se puede obedecer; «proporción del rostro insuficiente», no.
String consejoPara(FalloDeCalidad fallo) {
  switch (fallo) {
    case FalloDeCalidad.borrosa:
      return 'La foto salió movida. Sostenga el teléfono quieto y repita.';
    case FalloDeCalidad.oscura:
      return 'Hay poca luz. Busque un sitio más iluminado.';
    case FalloDeCalidad.quemada:
      return 'Hay demasiada luz de frente. Evite el sol o la lámpara detrás de usted.';
    case FalloDeCalidad.sinRostro:
      return 'No se ve ningún rostro. Encuadre la cara de la persona.';
    case FalloDeCalidad.variosRostros:
      return 'Se ve más de una persona. La foto debe ser de una sola.';
    case FalloDeCalidad.demasiadoLejos:
      return 'Acérquese: el rostro se ve muy pequeño.';
    case FalloDeCalidad.demasiadoCerca:
      return 'Aléjese un poco: el rostro no cabe en el encuadre.';
  }
}

/// El juicio. Devuelve TODOS los fallos, no el primero.
///
/// Devolver solo el primero obligaría al residente a repetir la foto una vez
/// por problema: corrige la luz, le dicen que está movida; la sostiene quieta,
/// le dicen que se acerque. Tres intentos para lo que se arregla en uno.
///
/// El orden es estable —el del enumerado— para que la pantalla pinte siempre
/// los mismos consejos en el mismo sitio y no salten al repetir.
List<FalloDeCalidad> evaluarCaptura(
  MedidasDeCaptura medidas, {
  UmbralesDeCalidad umbrales = const UmbralesDeCalidad(),
}) {
  final fallos = <FalloDeCalidad>[];

  if (medidas.nitidez < umbrales.nitidezMinima) fallos.add(FalloDeCalidad.borrosa);
  if (medidas.iluminacion < umbrales.iluminacionMinima) fallos.add(FalloDeCalidad.oscura);
  if (medidas.iluminacion > umbrales.iluminacionMaxima) fallos.add(FalloDeCalidad.quemada);

  if (medidas.rostrosDetectados == 0) {
    fallos.add(FalloDeCalidad.sinRostro);
    // Sin rostro, la proporción no significa nada: añadir «acérquese» aquí
    // sería un consejo imposible de obedecer.
    return fallos;
  }
  if (medidas.rostrosDetectados > 1) fallos.add(FalloDeCalidad.variosRostros);

  if (medidas.proporcionRostro < umbrales.proporcionMinima) {
    fallos.add(FalloDeCalidad.demasiadoLejos);
  }
  if (medidas.proporcionRostro > umbrales.proporcionMaxima) {
    fallos.add(FalloDeCalidad.demasiadoCerca);
  }
  return fallos;
}

/// Azúcar para la pantalla: sirve o no sirve.
bool capturaAceptable(
  MedidasDeCaptura medidas, {
  UmbralesDeCalidad umbrales = const UmbralesDeCalidad(),
}) =>
    evaluarCaptura(medidas, umbrales: umbrales).isEmpty;
