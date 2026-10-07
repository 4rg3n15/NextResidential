/// Primer ingreso, último paso · el titular dice cuántas personas viven en su
/// vivienda (D6), de 1 al tope de su vivienda (RONDA 15-W, D-W10).
///
/// Desde la 15-W el número ya NO es definitivo: después el titular añade y
/// retira plazas en «Ocupantes», así que no hay diálogo de «es definitivo» ni
/// confirmación que lo haga parecer irreversible. El aviso que se lee —con el
/// tope de la vivienda— lo manda el servidor: la app y la consola dicen lo
/// mismo. Si se pide más del tope, el servidor lo dice con su texto.
///
/// Salió de `ocupantes.dart` cuando aquél pasó a ser la pantalla con la que el
/// titular gestiona sus plazas: es un paso del primer ingreso, no una gestión.
library;

import 'package:flutter/material.dart';

import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import 'campos_de_perfil.dart';

/// La cota absoluta de la plataforma; el tope de cada vivienda lo dice el
/// servidor al declarar.
const _maximo = 20;

class PantallaDeDeclararOcupantes extends StatefulWidget {
  const PantallaDeDeclararOcupantes({
    super.key,
    required this.aviso,
    required this.repositorio,
    required this.alDeclarar,
    required this.alSalir,
  });

  final String aviso;
  final RepositorioDeAlta repositorio;
  final void Function(MisOcupantes ocupantes) alDeclarar;
  final void Function() alSalir;

  @override
  State<PantallaDeDeclararOcupantes> createState() => _EstadoDeDeclaracion();
}

class _EstadoDeDeclaracion extends State<PantallaDeDeclararOcupantes> {
  int _numero = 1;
  bool _enviando = false;
  String? _rechazo;

  Future<void> _declarar() async {
    setState(() {
      _enviando = true;
      _rechazo = null;
    });
    try {
      final r = await widget.repositorio.declararOcupantes(_numero);
      if (mounted) widget.alDeclarar(r);
    } on Fallo catch (f) {
      if (mounted) setState(() => _rechazo = f.detalle);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('¿Cuántos viven en su vivienda?'),
        automaticallyImplyLeading: false,
        actions: [TextButton(onPressed: widget.alSalir, child: const Text('Salir'))],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Cuente a todas las personas que viven en la vivienda, usted incluido. Cada una '
              'tendrá su plaza: los adultos crean su cuenta con el código de la suya, y a los '
              'menores los registra usted desde Mi familia.',
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.tertiaryContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(widget.aviso, key: const Key('ocupantes.aviso')),
            ),
            const SizedBox(height: 16),
            if (_rechazo != null) AvisoDeRechazo(_rechazo!),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton.outlined(
                  tooltip: 'Uno menos',
                  onPressed: _numero > 1 ? () => setState(() => _numero -= 1) : null,
                  icon: const Icon(Icons.remove),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    '$_numero',
                    key: const Key('ocupantes.numero'),
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                ),
                IconButton.outlined(
                  tooltip: 'Uno más',
                  onPressed: _numero < _maximo ? () => setState(() => _numero += 1) : null,
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Podrá añadir o retirar plazas después, en Ocupantes.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(
              key: const Key('ocupantes.declarar'),
              onPressed: _enviando ? null : _declarar,
              child: Text(_enviando ? 'Enviando…' : 'Continuar'),
            ),
          ],
        ),
      ),
    );
  }
}
