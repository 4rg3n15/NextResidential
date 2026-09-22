/// El tema de la app, derivado del MISMO sistema de diseño que la consola.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// D-78 · CERRADA. LOS COLORES YA NO SE COPIAN: SE GENERAN
///
/// Hasta la ETAPA 14 este fichero llevaba los valores hexadecimales escritos a
/// mano, porque Dart no puede leer `packages/config/src/temas.ts`. La deuda
/// estaba declarada con su salida escrita, y es la que se aplicó:
/// `scripts/lib/generar-paleta-dart.mjs` emite `paleta.g.dart` desde el preset
/// COMPILADO, igual que se genera el cliente de API (§2.6), y
/// `pnpm paleta:desfasada` rompe el build si alguien edita lo generado o si el
/// preset cambia y nadie regenera.
///
/// **Lo que la prueba anterior no podía ver, y se vio al generar.** Aquella
/// leía el `.ts` como texto y comprobaba que cada color copiado siguiera
/// apareciendo allí. Daba verde sobre tres divergencias reales:
///
///  · `bordeOscuro` era `#2A2A3D`, que es `oscuro.borde` del tema **CLARO**.
///    El borde del tema oscuro del preset es `#33334A`. La cadena existía en
///    el fichero, así que la prueba pasaba.
///  · `fondoOscuro` (`#0B0B12`) y `tarjetaOscura` (`#15151F`) venían de la
///    familia `oscuro.*`, que son planos de superficie, y no de `lienzo` y
///    `tarjeta`, que son los que el tema oscuro declara para eso.
///  · De los cuarenta tokens que el preset declara por tema, la app había
///    copiado quince, y ninguna comprobación podía notar los veinticinco que
///    faltaban.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LA REGLA QUE SE HEREDA DE LA 09-B: PAREJAS, NO COLORES SUELTOS
///
/// El preset declara fondo y texto **juntos** porque declararlos por separado
/// produjo `bg-exito text-white` a 2,537:1 de contraste, menos de la mitad de
/// lo que AA exige. Aquí se respeta: cada color de fondo de este fichero viene
/// con el color de texto que le corresponde, y no hay forma de pedir uno sin el
/// otro. Las parejas se componen a partir de los tokens generados; los valores
/// no se vuelven a escribir.
library;

import 'package:flutter/material.dart';

import 'paleta.g.dart';

/// Parejas de fondo y texto. No se puede usar una mitad.
class Pareja {
  const Pareja(this.fondo, this.texto);
  final Color fondo;
  final Color texto;
}

/// Fachada sobre los tokens generados. **Ni un valor hexadecimal aquí**: si
/// aparece uno, es una copia a mano y D-78 vuelve a estar abierta.
class Paleta {
  static const marca = PaletaClara.marca;
  static const botonMarca = Pareja(PaletaClara.marcaBoton, PaletaClara.constanteBlanco);

  static const exito = Pareja(PaletaClara.exitoBoton, PaletaClara.constanteBlanco);
  static const exitoSuave = Pareja(PaletaClara.exitoSuave, PaletaClara.exitoTexto);
  static const aviso = Pareja(PaletaClara.aviso, PaletaClara.texto);
  static const avisoSuave = Pareja(PaletaClara.avisoSuave, PaletaClara.avisoTexto);
  static const peligroSuave = Pareja(PaletaClara.peligroSuave, PaletaClara.peligroTexto);
  static const neutroSuave = Pareja(PaletaClara.neutroSuave, PaletaClara.neutroTexto);

  static const fondo = PaletaClara.lienzo;
  static const tarjeta = PaletaClara.tarjeta;
  static const borde = PaletaClara.borde;
  static const textoFuerte = PaletaClara.texto;
  static const textoSuave = PaletaClara.textoApagado;

  // Modo oscuro: los tokens del TEMA OSCURO, no los de la familia `oscuro.*`
  // del tema claro. Ver la nota de D-78 arriba: ahí estaba la divergencia.
  static const fondoOscuro = PaletaOscura.lienzo;
  static const tarjetaOscura = PaletaOscura.tarjeta;
  static const bordeOscuro = PaletaOscura.borde;
  static const textoClaro = PaletaOscura.texto;
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
