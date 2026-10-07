/// Un menor del hogar en «Mi familia» (RONDA 15-W, D-W2, D4).
///
/// Lo que el servidor dice de él —edad, documento ENMASCARADO, parentesco y
/// plaza— y lo que cualquier adulto de la vivienda puede hacer: editarlo y
/// darlo de baja con motivo. Cuando ya cumplió 18, el titular le genera el
/// código con el que crea su propia cuenta conservando su historial; el botón
/// sólo existe si quien mira es el titular (lo decide el servidor, que lo
/// vuelve a comprobar).
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/menores.dart';
import '../pantallas/comunes.dart';

/// Lo que se puede hacer con los menores desde «Mi familia».
class AccionesSobreMenores {
  const AccionesSobreMenores({
    required this.alAnadir,
    required this.alEditar,
    required this.alDarDeBaja,
    this.alPedirCodigo,
  });

  final VoidCallback alAnadir;
  final void Function(MenorDelHogar menor) alEditar;
  final void Function(MenorDelHogar menor) alDarDeBaja;

  /// Sólo el titular: el código de traspaso de quien ya cumplió 18.
  final void Function(MenorDelHogar menor)? alPedirCodigo;
}

class FilaDeMenor extends StatelessWidget {
  const FilaDeMenor({super.key, required this.menor, this.acciones});
  final MenorDelHogar menor;
  final AccionesSobreMenores? acciones;

  @override
  Widget build(BuildContext context) {
    final m = menor;
    final a = acciones;
    final codigo = a?.alPedirCodigo;
    return Card(
      key: Key('menor.${m.residenteId}'),
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              leading: CircleAvatar(
                backgroundColor: Paleta.neutroSuave.fondo,
                child: Text(
                  m.nombreCompleto.isEmpty ? '?' : m.nombreCompleto.characters.first.toUpperCase(),
                  style: TextStyle(color: Paleta.neutroSuave.texto, fontWeight: FontWeight.w700),
                ),
              ),
              title: Text(m.nombreCompleto),
              subtitle: Text(
                [
                  if (m.parentesco != null) m.parentesco!,
                  if (m.edad != null) '${m.edad} años',
                  m.documentoLegible,
                  if (m.plazaNumero != null) 'plaza ${m.plazaNumero}',
                ].join(' · '),
              ),
              trailing: const Distintivo(texto: 'Sin cuenta', pareja: Paleta.neutroSuave),
            ),
            if (m.yaEsMayor)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'Ya cumplió 18 años: puede crear su propia cuenta con un código que genera el '
                  'titular.',
                  style: TextStyle(fontSize: 13),
                ),
              ),
            if (a != null)
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 4,
                children: [
                  if (m.yaEsMayor && codigo != null)
                    TextButton(
                      key: Key('menor.traspaso.${m.residenteId}'),
                      onPressed: () => codigo(m),
                      child: const Text('Código para su cuenta'),
                    ),
                  TextButton(
                    key: Key('menor.editar.${m.residenteId}'),
                    onPressed: () => a.alEditar(m),
                    child: const Text('Editar'),
                  ),
                  TextButton(
                    key: Key('menor.baja.${m.residenteId}'),
                    onPressed: () => a.alDarDeBaja(m),
                    child: const Text('Dar de baja'),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
