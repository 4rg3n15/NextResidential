/// El `MaterialApp` de la app del residente: tema, idioma y título.
///
/// Salió de `app.dart` en la RONDA 15-W para que el armazón —sesión,
/// navegación, ciclo de recarga— no siguiera creciendo con la configuración
/// visual: el tema y el idioma cambian por razones que no son las del armazón.
library;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../configuracion/tema.dart';

class MaterialDeLaApp extends StatelessWidget {
  const MaterialDeLaApp({super.key, required this.inicio});

  /// La primera pantalla: el armazón.
  final Widget inicio;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Next Control Residencial',
      debugShowCheckedModeBanner: false,
      theme: temaClaro(),
      darkTheme: temaOscuro(),
      // C5 (15-M) · los selectores de fecha y hora hablan español de
      // Colombia; sin esto el `locale` del `showDatePicker` no tiene textos.
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('es', 'CO'), Locale('es'), Locale('en')],
      locale: const Locale('es', 'CO'),
      home: inicio,
    );
  }
}
