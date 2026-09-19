/// El tema de la app, derivado del MISMO sistema de diseño que la consola.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ LOS COLORES SE COPIAN Y NO SE IMPORTAN
///
/// El preset vive en `packages/config/src/temas.ts` y es TypeScript: Dart no
/// puede leerlo. Copiarlos a mano es lo que hay, y es una deuda declarada —
/// **D-78**: la salida limpia es generar este fichero desde el preset, como se
/// genera el cliente de API. Mientras no exista, la prueba
/// `test/configuracion/tema_test.dart` compara estos valores con los del preset
/// leyendo el `.ts`, de modo que una divergencia rompe la suite en vez de
/// aparecer como «la app se ve distinta de la consola».
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LA REGLA QUE SE HEREDA DE LA 09-B: PAREJAS, NO COLORES SUELTOS
///
/// El preset declara fondo y texto **juntos** porque declararlos por separado
/// produjo `bg-exito text-white` a 2,537:1 de contraste, menos de la mitad de
/// lo que AA exige. Aquí se respeta: cada color de fondo de este fichero viene
/// con el color de texto que le corresponde, y no hay forma de pedir uno sin el
/// otro.
library;

import 'package:flutter/material.dart';

/// Parejas de fondo y texto. No se puede usar una mitad.
class Pareja {
  const Pareja(this.fondo, this.texto);
  final Color fondo;
  final Color texto;
}

class Paleta {
  // Marca. El rojo es el color de marca de Next Control, y `boton` es el tono
  // que pasa AA con texto blanco encima (#DC3341 frente a #E63946).
  static const marca = Color(0xFFE63946);
  static const botonMarca = Pareja(Color(0xFFDC3341), Colors.white);

  static const exito = Pareja(Color(0xFF0A855C), Colors.white);
  static const exitoSuave = Pareja(Color(0xFFD1FAE5), Color(0xFF047857));
  static const aviso = Pareja(Color(0xFFF59E0B), Color(0xFF111827));
  static const avisoSuave = Pareja(Color(0xFFFEF3C7), Color(0xFFB45309));
  static const peligroSuave = Pareja(Color(0xFFFEF3F3), Color(0xFFA23037));
  static const neutroSuave = Pareja(Color(0xFFF3F4F6), Color(0xFF4B5563));

  static const fondo = Color(0xFFF8F9FA);
  static const tarjeta = Colors.white;
  static const borde = Color(0xFFE5E7EB);
  static const textoFuerte = Color(0xFF111827);
  static const textoSuave = Color(0xFF6B7280);

  // Modo oscuro: los tres planos del preset.
  static const fondoOscuro = Color(0xFF0B0B12);
  static const tarjetaOscura = Color(0xFF15151F);
  static const bordeOscuro = Color(0xFF2A2A3D);
  static const textoClaro = Color(0xFFF8F9FA);
}

ThemeData temaClaro() => _tema(Brightness.light);
ThemeData temaOscuro() => _tema(Brightness.dark);

ThemeData _tema(Brightness brillo) {
  final oscuro = brillo == Brightness.dark;
  final superficie = oscuro ? Paleta.tarjetaOscura : Paleta.tarjeta;
  final fondo = oscuro ? Paleta.fondoOscuro : Paleta.fondo;
  final texto = oscuro ? Paleta.textoClaro : Paleta.textoFuerte;
  final borde = oscuro ? Paleta.bordeOscuro : Paleta.borde;

  return ThemeData(
    useMaterial3: true,
    brightness: brillo,
    scaffoldBackgroundColor: fondo,
    colorScheme: ColorScheme.fromSeed(seedColor: Paleta.marca, brightness: brillo).copyWith(
      primary: Paleta.botonMarca.fondo,
      onPrimary: Paleta.botonMarca.texto,
      surface: superficie,
      onSurface: texto,
      error: Paleta.marca,
    ),
    // Helvetica en la consola; en móvil se usa la tipografía del sistema, que es
    // la que el usuario ya tiene configurada para accesibilidad. Empaquetar una
    // fuente y forzarla rompe el tamaño de letra grande que el residente eligió.
    cardTheme: CardThemeData(
      color: superficie,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: borde),
      ),
      margin: EdgeInsets.zero,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: fondo,
      foregroundColor: texto,
      elevation: 0,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: superficie,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: borde),
      ),
    ),
    // 48 dp de alto mínimo: el objetivo táctil accesible. Menos de eso falla el
    // criterio AA de tamaño de objetivo, y se nota en un teléfono, con una mano.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        backgroundColor: Paleta.botonMarca.fondo,
        foregroundColor: Paleta.botonMarca.texto,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
  );
}
