/// 15-X (D2) · Recién dado de alta, se le ofrece al residente registrar su
/// rostro. Una vez, con «Ahora no»: es opcional, y «Mi perfil → Mi rostro»
/// sigue a mano. No es un paso que haya que cumplir: es una invitación.
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/puertos.dart';
import '../../dominio/rostro.dart';
import 'mi_rostro.dart';

class PantallaDeOfrecerRostro extends StatelessWidget {
  const PantallaDeOfrecerRostro({
    super.key,
    required this.rostro,
    required this.tomarFoto,
    required this.alSeguir,
  });

  final RostroDelResidente rostro;
  final TomarFoto tomarFoto;

  /// Respondida la invitación —con «Ahora no», o al volver de «Mi rostro»—,
  /// sigue el primer ingreso.
  final void Function() alSeguir;

  Future<void> _registrar(BuildContext context) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PantallaDeMiRostro(rostro: rostro, tomarFoto: tomarFoto),
      ),
    );
    alSeguir();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.face_retouching_natural, size: 56),
                const SizedBox(height: 16),
                Text('Entre con su rostro', style: t.headlineSmall, textAlign: TextAlign.center),
                const SizedBox(height: 12),
                const Text(
                  'Con su rostro registrado, la terminal de la portería lo reconoce y le abre. '
                  'Es opcional: puede entrar sin él y registrarlo después desde «Mi perfil».',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Paleta.textoSuave),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  key: const Key('rostro.ofrecer.registrar'),
                  onPressed: () => _registrar(context),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  child: const Text('Registrar mi rostro'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  key: const Key('rostro.ofrecer.ahoraNo'),
                  onPressed: alSeguir,
                  child: const Text('Ahora no'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
