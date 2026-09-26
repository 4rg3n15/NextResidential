/// D6 · cuántas personas viven en la vivienda: lo declara UNA VEZ el primer
/// residente, y es DEFINITIVO. Después, sólo el superadministrador lo cambia.
///
/// El aviso que se lee antes de confirmar lo manda el servidor (sale del
/// dominio compartido): la app y la consola dicen exactamente lo mismo, y el
/// servidor exige la confirmación además de recibirla (`confirmoQueEsDefinitivo`).
///
/// Cada plaza libre trae su código de un solo uso, que el residente le da a
/// quien vive con él para que se vincule (ADR-025): el código se DERIVA en el
/// servidor, no se guarda en el teléfono.
library;

import 'package:flutter/material.dart';

import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import 'campos_de_perfil.dart';

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

  Future<void> _confirmar() async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (contexto) => AlertDialog(
        title: Text('¿Confirma $_numero ${_numero == 1 ? 'ocupante' : 'ocupantes'}?'),
        content: Text(widget.aviso),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(contexto).pop(false),
            child: const Text('Revisar'),
          ),
          FilledButton(
            key: const Key('ocupantes.confirmar'),
            onPressed: () => Navigator.of(contexto).pop(true),
            child: const Text('Confirmar, es definitivo'),
          ),
        ],
      ),
    );
    if (confirmado != true || !mounted) return;
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
              'tendrá su propio código para usar la app.',
            ),
            const SizedBox(height: 12),
            // El aviso se ve ANTES de elegir, no sólo en el diálogo: quien lee
            // «definitivo» por primera vez al confirmar ya decidió.
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
                  onPressed: _numero < 20 ? () => setState(() => _numero += 1) : null,
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            const SizedBox(height: 24),
            FilledButton(
              key: const Key('ocupantes.declarar'),
              onPressed: _enviando ? null : _confirmar,
              child: Text(_enviando ? 'Enviando…' : 'Declarar'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Las plazas en el perfil: quién ocupa cada una y el código de las libres.
class TarjetaDeOcupantes extends StatelessWidget {
  const TarjetaDeOcupantes({super.key, required this.ocupantes});
  final MisOcupantes ocupantes;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            title: Text('Ocupantes: ${ocupantes.declarados}'),
            subtitle: const Text('Sólo la administración cambia este número.'),
          ),
          ...ocupantes.plazas.map(
            (p) => ListTile(
              dense: true,
              leading: CircleAvatar(radius: 14, child: Text('${p.numero}')),
              title: Text(p.libre ? 'Plaza libre' : (p.ocupante ?? 'Ocupada')),
              subtitle: p.libre && p.codigo != null
                  ? SelectableText('Código: ${p.codigo}', key: Key('ocupantes.codigo.${p.numero}'))
                  : null,
            ),
          ),
        ],
      ),
    );
  }
}
