/// Ocupantes · las plazas de la vivienda y sus códigos (ETAPA 15-I, RONDA
/// 15-W, D-W10).
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LO QUE VE EL TITULAR
///
/// Cada plaza libre con su código, ya con el prefijo del conjunto
/// («MIRA-K7PQ-2XWZ»), y un «Compartir» que copia el mensaje completo —qué
/// hacer y el código—: con él, quien vive con el titular crea su propia cuenta
/// en «Crear cuenta». El cupo se lee «3 de 4»; «Añadir plaza» responde hasta
/// el tope, y en el tope se dice a quién pedir más. «Retirar» sólo aparece en
/// las plazas libres, y pide un motivo.
///
/// Desde la 15-W el número ya no es DEFINITIVO: el aviso de antes se quitó. El
/// tope y quién es el titular los dice el servidor en cada lectura, y la base
/// vuelve a contar al escribir: dos teléfonos pulsando «Añadir» a la vez no
/// pasan del tope. Cualquier otro adulto ve las plazas y comparte los códigos,
/// pero no añade ni retira.
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/hogar.dart';
import '../controlador.dart';
import '../widgets/compartir.dart';
import '../widgets/estados.dart';
import 'comunes.dart';

class PantallaDeOcupantes extends StatefulWidget {
  const PantallaDeOcupantes({
    super.key,
    required this.controlador,
    required this.alPedirAcceso,
    required this.alAnadir,
    required this.alRetirar,
  });

  final ControladorDeVista<MisOcupantes> controlador;
  final void Function() alPedirAcceso;
  final Future<void> Function() alAnadir;
  final Future<void> Function(PlazaDeOcupante plaza) alRetirar;

  @override
  State<PantallaDeOcupantes> createState() => _EstadoDeOcupantes();
}

class _EstadoDeOcupantes extends State<PantallaDeOcupantes> {
  /// Una escritura en vuelo: un segundo toque no pide otra plaza.
  bool _ocupado = false;

  Future<void> _hacer(Future<void> Function() accion) async {
    if (_ocupado) return;
    setState(() => _ocupado = true);
    try {
      await accion();
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controlador;
    return Scaffold(
      appBar: AppBar(title: const Text('Ocupantes')),
      body: AnimatedBuilder(
        animation: c,
        builder: (context, _) => RefreshIndicator(
          onRefresh: c.refrescar,
          child: VistaConEstado<MisOcupantes>(
            estado: c.estado,
            alReintentar: c.cargarAhora,
            alPedirAcceso: widget.alPedirAcceso,
            conDatos: (o, {required desdeCache}) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                if (desdeCache) const MarcaDeCache(),
                Card(
                  child: ListTile(
                    title: Text('Plazas: ${o.cupo}', key: const Key('ocupantes.cupo')),
                    subtitle: Text(o.aviso),
                  ),
                ),
                const SizedBox(height: 8),
                ...o.plazas.map(
                  (p) => _Plaza(
                    plaza: p,
                    retirable: o.sePuedeRetirar(p) && !_ocupado,
                    alRetirar: () => _hacer(() => widget.alRetirar(p)),
                  ),
                ),
                const SizedBox(height: 8),
                if (o.esTitular) ...[
                  FilledButton.icon(
                    key: const Key('ocupantes.anadir'),
                    onPressed: o.puedeAnadir && !_ocupado ? () => _hacer(widget.alAnadir) : null,
                    icon: const Icon(Icons.add),
                    label: const Text('Añadir plaza'),
                  ),
                  if (o.alTope)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(avisoDelTope, key: Key('ocupantes.tope')),
                    ),
                ] else
                  const Text(
                    'Sólo el titular de la vivienda añade y retira plazas.',
                    style: TextStyle(color: Paleta.textoSuave),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Plaza extends StatelessWidget {
  const _Plaza({required this.plaza, required this.retirable, required this.alRetirar});
  final PlazaDeOcupante plaza;
  final bool retirable;
  final VoidCallback alRetirar;

  @override
  Widget build(BuildContext context) {
    final p = plaza;
    final codigo = p.libre ? p.codigo : null;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              leading: CircleAvatar(radius: 16, child: Text('${p.numero}')),
              title: Text(p.libre ? 'Plaza libre' : (p.ocupante ?? 'Ocupada')),
              subtitle: codigo != null
                  ? SelectableText(codigo, key: Key('ocupantes.codigo.${p.numero}'))
                  : (p.sinCuenta ? const Text('Menor de edad, sin cuenta') : null),
              trailing: p.sinCuenta
                  ? const Distintivo(texto: 'Sin cuenta', pareja: Paleta.neutroSuave)
                  : null,
            ),
            if (codigo != null || retirable)
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 4,
                children: [
                  if (codigo != null) BotonCompartir(codigo: codigo),
                  if (retirable)
                    TextButton(
                      key: Key('ocupantes.retirar.${p.numero}'),
                      onPressed: alRetirar,
                      child: const Text('Retirar'),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

/// Las plazas en el perfil: el cupo y el camino a «Ocupantes».
class TarjetaDeOcupantes extends StatelessWidget {
  const TarjetaDeOcupantes({super.key, required this.ocupantes, this.alAbrir});
  final MisOcupantes ocupantes;
  final VoidCallback? alAbrir;

  @override
  Widget build(BuildContext context) {
    final libres = ocupantes.libres.length;
    return Card(
      child: ListTile(
        key: const Key('perfil.ocupantes'),
        leading: const Icon(Icons.groups_outlined),
        title: const Text('Ocupantes'),
        subtitle: Text(
          'Plazas: ${ocupantes.cupo}'
          '${libres == 0 ? '' : ' · $libres libre${libres == 1 ? '' : 's'} con código'}',
        ),
        trailing: alAbrir == null ? null : const Icon(Icons.chevron_right),
        onTap: alAbrir,
      ),
    );
  }
}
