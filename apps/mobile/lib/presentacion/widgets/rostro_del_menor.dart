/// El rostro en la ficha de un menor del hogar (RONDA 15-X, D3, ADR-039).
///
/// Según su edad y quién mira (`rostroDelMenorEnLaApp`): el titular, con un
/// menor de 15 a 17 años, lo abre para registrarlo, verlo o retirarlo; a
/// cualquier otro se le explica por qué no; con 18 cumplidos no se dice nada
/// aquí —su ficha ofrece el código para que cree su cuenta—. El servidor lo
/// vuelve a comprobar todo.
library;

import 'package:flutter/material.dart';

import '../../dominio/menores.dart';
import '../../dominio/rostro_de_menor.dart';

class SeccionDelRostroDelMenor extends StatelessWidget {
  const SeccionDelRostroDelMenor({
    super.key,
    required this.menor,
    required this.esTitular,
    required this.alAbrir,
  });

  final MenorDelHogar menor;
  final bool esTitular;
  final void Function() alAbrir;

  @override
  Widget build(BuildContext context) {
    final r = rostroDelMenorEnLaApp(menor, esTitular: esTitular);
    if (r == RostroDelMenorEnLaApp.yaEsMayor) return const SizedBox.shrink();
    final gestiona = r == RostroDelMenorEnLaApp.gestionar;
    return Card(
      key: const Key('menor.rostro'),
      margin: const EdgeInsets.only(top: 16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Su rostro', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 6),
            Text(
              explicacionDelRostroDelMenor(r) ??
                  (menor.tieneRostro
                      ? 'Tiene su rostro registrado para la terminal de la portería.'
                      : 'Opcional: con su rostro, la terminal de la portería lo reconoce. '
                            'Lo autoriza usted, como su representante legal.'),
              key: const Key('menor.rostro.texto'),
            ),
            if (gestiona) ...[
              const SizedBox(height: 8),
              FilledButton.tonal(
                key: const Key('menor.rostro.abrir'),
                onPressed: alAbrir,
                child: Text(menor.tieneRostro ? 'Ver su rostro' : 'Registrar rostro'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
