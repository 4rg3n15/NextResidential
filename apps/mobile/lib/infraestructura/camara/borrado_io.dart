/// 15-X · el borrado de la copia del selector donde hay sistema de archivos
/// (iOS y Android). Ver `copia_temporal.dart`.
library;

import 'dart:io';

import 'copia_temporal.dart';

/// Best effort: si ya no estaba, o el sistema no deja, la foto sigue viajando
/// en memoria y nada falla por ello.
Future<void> borrarCopiaDelSelector(String ruta) async {
  if (!esCopiaDelSelector(ruta)) return;
  try {
    await File(ruta).delete();
  } on FileSystemException {
    // Ya no estaba: no hay nada que borrar.
  }
}
