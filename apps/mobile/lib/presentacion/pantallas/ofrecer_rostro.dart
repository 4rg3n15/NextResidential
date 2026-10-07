/// 15-X (D2) · Antes de la app se le ofrece al residente registrar su rostro,
/// mientras no lo tenga y no haya dicho «Ahora no» (`OfertaDelRostro`, que lo
/// recuerda por cuenta). Es opcional, y «Mi perfil → Mi rostro» sigue a mano:
/// no es un paso que haya que cumplir, es una invitación.
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
  /// sigue el primer ingreso. `ahoraNo` es la respuesta que se recuerda.
  final Future<void> Function({required bool ahoraNo}) alSeguir;

  Future<void> _registrar(BuildContext context) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PantallaDeMiRostro(rostro: rostro, tomarFoto: tomarFoto),
      ),
    );
    await alSeguir(ahoraNo: false);
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
                  onPressed: () => alSeguir(ahoraNo: true),
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
