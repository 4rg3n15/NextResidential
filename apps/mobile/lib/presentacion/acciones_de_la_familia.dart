/// Las acciones de «Mi familia» y de «Ocupantes» (RONDA 15-W): los menores del
/// hogar y las plazas del titular.
///
/// Viven fuera del armazón por lo mismo que `AccionesDelHogar`: el armazón
/// gobierna la sesión y la navegación principal; esto traduce un toque en un
/// diálogo, una escritura y una recarga. Cada escritura recarga lo que cambia
/// con ella —la familia, los menores y las plazas se mueven juntos: dar de baja
/// a un menor libera su plaza— y nada más.
///
/// Ningún rechazo se interpreta aquí: el texto del servidor —«Una persona
/// mayor de edad crea su propia cuenta…», «Primero dé de baja a la persona»,
/// «Su vivienda tiene el máximo de N plazas…»— se enseña tal cual.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../aplicacion/estado.dart';
import '../dominio/entidades.dart';
import '../dominio/hogar.dart';
import '../dominio/menores.dart';
import '../dominio/puertos.dart';
import 'controlador.dart';
import 'dependencias.dart';
import 'pantallas/familia.dart';
import 'pantallas/menor.dart';
import 'pantallas/ocupantes.dart';
import 'pestanas.dart';
import 'widgets/compartir.dart';
import 'widgets/dialogo_de_motivo.dart';

/// Abre una pantalla encima, con lo que el ciclo de recarga mantiene al día
/// mientras se ve.
typedef AbrirEncima = Future<void> Function(
  Widget pantalla,
  List<ControladorDeVista<Object?>> visibles,
);

class AccionesDeLaFamilia {
  AccionesDeLaFamilia({
    required this.menores,
    required this.plazas,
    required this.alta,
    required this.familia,
    required this.menoresDelHogar,
    required this.ocupantes,
    required this.reloj,
    required this.abrir,
  });

  /// Las del armazón: sus puertos y sus controladores de vista.
  factory AccionesDeLaFamilia.delArmazon(
    Dependencias d,
    ControladoresDelArmazon c, {
    required AbrirEncima abrir,
  }) => AccionesDeLaFamilia(
    menores: d.menores,
    plazas: d.plazas,
    alta: d.alta,
    familia: c.familia,
    menoresDelHogar: c.menores,
    ocupantes: c.ocupantes,
    reloj: d.reloj,
    abrir: abrir,
  );

  final RepositorioDeMenores menores;
  final RepositorioDePlazas plazas;
  final RepositorioDeAlta alta;
  final ControladorDeVista<List<MiembroDeFamilia>> familia;
  final ControladorDeVista<List<MenorDelHogar>> menoresDelHogar;
  final ControladorDeVista<MisOcupantes> ocupantes;
  final Reloj reloj;
  final AbrirEncima abrir;

  /// El mensajero se toma ANTES de esperar nada: después de una escritura,
  /// la pantalla que la pidió puede haberse cerrado.
  void Function(String) _avisador(BuildContext context) {
    final mensajero = ScaffoldMessenger.of(context);
    return (texto) => mensajero.showSnackBar(SnackBar(content: Text(texto)));
  }

  /// Quién es el titular lo dicen las plazas, que manda el servidor.
  bool get _esTitular => switch (ocupantes.estado) {
    ConDatos(datos: final o) => o.esTitular,
    Cargando(previo: final o?) || Fallido(previo: final o?) => o.esTitular,
    _ => false,
  };

  void _recargar() {
    unawaited(familia.refrescar());
    unawaited(menoresDelHogar.refrescar());
    unawaited(ocupantes.refrescar());
  }

  Future<void> abrirFamilia(BuildContext context, {required void Function() alPedirAcceso}) =>
      abrir(
        PantallaDeFamilia(
          controlador: familia,
          alPedirAcceso: alPedirAcceso,
          menores: menoresDelHogar,
          acciones: AccionesSobreMenores(
            alAnadir: () => anadirMenor(context),
            alEditar: (m) => editarMenor(context, m),
            alDarDeBaja: (m) => darDeBaja(context, m),
            alPedirCodigo: _esTitular ? (m) => codigoDeTraspaso(context, m) : null,
          ),
        ),
        [familia, menoresDelHogar],
      );

  Future<void> abrirOcupantes(BuildContext context, {required void Function() alPedirAcceso}) =>
      abrir(
        PantallaDeOcupantes(
          controlador: ocupantes,
          alPedirAcceso: alPedirAcceso,
          alAnadir: () => anadirPlaza(context),
          alRetirar: (p) => retirarPlaza(context, p),
        ),
        [ocupantes],
      );

  /// Un menor ocupa una plaza LIBRE: se leen las de ahora, no las de la
  /// última recarga.
  Future<void> anadirMenor(BuildContext context) async {
    final avisar = _avisador(context);
    final MisOcupantes actuales;
    try {
      actuales = await alta.misOcupantes();
    } on Fallo catch (f) {
      avisar(f.detalle);
      return;
    }
    if (!context.mounted) return;
    if (actuales.libres.isEmpty) {
      avisar(
        actuales.esTitular
            ? 'No hay plazas libres. Añada una en Ocupantes y vuelva a intentarlo.'
            : 'No hay plazas libres. Pídale al titular que añada una en Ocupantes.',
      );
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (ruta) => PantallaDeMenor.nuevo(
          repositorio: menores,
          hoy: reloj.ahora(),
          libres: actuales.libres,
          alGuardar: () {
            Navigator.of(ruta).pop();
            avisar('Menor registrado en su plaza.');
            _recargar();
          },
        ),
      ),
    );
  }

  Future<void> editarMenor(BuildContext context, MenorDelHogar menor) {
    final avisar = _avisador(context);
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (ruta) => PantallaDeMenor.editar(
          repositorio: menores,
          hoy: reloj.ahora(),
          menor: menor,
          alGuardar: () {
            Navigator.of(ruta).pop();
            avisar('Datos guardados.');
            _recargar();
          },
        ),
      ),
    );
  }

  Future<void> darDeBaja(BuildContext context, MenorDelHogar menor) async {
    final avisar = _avisador(context);
    final motivo = await pedirMotivo(
      context,
      titulo: '¿Dar de baja a ${menor.nombreCompleto}?',
      explicacion:
          'Deja de ser residente de su vivienda y su plaza queda libre. Si su rostro estaba en '
          'los equipos del conjunto, se retira.',
      accion: 'Dar de baja',
      minimo: motivoMinimoDeBaja,
    );
    if (motivo == null || !context.mounted) return;
    try {
      await menores.darDeBajaMenor(menor.residenteId, motivo: motivo);
      avisar('Se dio de baja a ${menor.nombreCompleto}. Su plaza quedó libre.');
      _recargar();
    } on Fallo catch (f) {
      avisar(f.detalle);
    }
  }

  /// Sólo el titular, y sólo para quien ya cumplió 18: con él crea su cuenta.
  Future<void> codigoDeTraspaso(BuildContext context, MenorDelHogar menor) async {
    final avisar = _avisador(context);
    final String codigo;
    try {
      codigo = await menores.codigoDeTraspaso(menor.residenteId);
    } on Fallo catch (f) {
      avisar(f.detalle);
      return;
    }
    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogo) => AlertDialog(
        title: Text('Código para ${menor.nombreCompleto}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Con este código crea su propia cuenta en «Crear cuenta» y conserva su '
              'historial. Sirve una sola vez.',
            ),
            const SizedBox(height: 12),
            SelectableText(
              codigo,
              key: const Key('menor.codigo'),
              style: Theme.of(dialogo).textTheme.titleLarge,
            ),
          ],
        ),
        actions: [
          BotonCompartir(codigo: codigo),
          TextButton(onPressed: () => Navigator.of(dialogo).pop(), child: const Text('Cerrar')),
        ],
      ),
    );
  }

  Future<void> anadirPlaza(BuildContext context) async {
    final avisar = _avisador(context);
    try {
      final o = await plazas.anadirPlaza();
      avisar('Plaza añadida. Plazas: ${o.cupo}.');
      _recargar();
    } on Fallo catch (f) {
      avisar(f.detalle);
    }
  }

  Future<void> retirarPlaza(BuildContext context, PlazaDeOcupante plaza) async {
    final avisar = _avisador(context);
    final motivo = await pedirMotivo(
      context,
      titulo: '¿Retirar la plaza ${plaza.numero}?',
      explicacion: 'Su código deja de servir. Si la necesita otra vez, podrá añadir una plaza.',
      accion: 'Retirar',
      minimo: motivoMinimoDeRetiro,
    );
    if (motivo == null || !context.mounted) return;
    try {
      await plazas.retirarPlaza(plaza.id, motivo: motivo);
      avisar('Plaza ${plaza.numero} retirada.');
      _recargar();
    } on Fallo catch (f) {
      avisar(f.detalle);
    }
  }
}
