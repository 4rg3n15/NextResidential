/// M-7 · HU-34 · Notificaciones: lo que pasó con las visitas del residente.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO (15-L)
///
/// Esta compilación no lleva servicio de mensajería: con la app cerrada no
/// llega nada al teléfono. La pantalla anterior enseñaba el registro del
/// aparato para avisos push —permiso, token, registro— con un botón
/// «Activar», y eso prometía algo que no podía pasar. Ahora dice la verdad
/// con una frase: «Los avisos llegan mientras la app está abierta».
///
/// Lo que lista sale de la API —la misma que usa la consola—: las visitas que
/// portería o la administración rechazaron, con el motivo que escribieron, y
/// los ingresos de sus visitantes, con fecha y hora. Se recarga sola mientras
/// está a la vista y al tirar hacia abajo; abrirla las marca como vistas y el
/// contador de Inicio vuelve a cero.
library;

import 'package:flutter/material.dart';

import '../../aplicacion/estado.dart';
import '../../configuracion/tema.dart';
import '../../dominio/notificaciones.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
import 'comunes.dart';

/// La frase que sustituye a cualquier interruptor de avisos. Una sola, para que
/// el perfil y esta pantalla no puedan decir cosas distintas.
const avisosConLaAppAbierta = 'Los avisos llegan mientras la app está abierta';

/// La fila del perfil que lleva aquí. Vive con la pantalla, y no en el perfil,
/// para que la frase de la fila y la de la pantalla no puedan separarse: es
/// lo que es verdad en esta compilación, sin interruptor.
class FilaDeNotificaciones extends StatelessWidget {
  const FilaDeNotificaciones({super.key, required this.alAbrir});
  final void Function() alAbrir;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: const Icon(Icons.notifications_outlined),
      title: const Text('Notificaciones'),
      subtitle: const Text(avisosConLaAppAbierta, style: TextStyle(fontSize: 12)),
      trailing: const Icon(Icons.chevron_right),
      onTap: alAbrir,
    ),
  );
}

class PantallaDeNotificaciones extends StatelessWidget {
  const PantallaDeNotificaciones({
    super.key,
    required this.controlador,
    required this.alPedirAcceso,
    this.alRecargar,
  });

  final ControladorDeVista<List<Notificacion>> controlador;
  final VoidCallback alPedirAcceso;

  /// Tirar hacia abajo: la vuelta del ciclo del armazón, si la hay.
  final Future<void> Function()? alRecargar;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notificaciones')),
      body: AnimatedBuilder(
        animation: controlador,
        builder: (context, _) => RefreshIndicator(
          onRefresh: alRecargar ?? controlador.refrescar,
          child: VistaConEstado<List<Notificacion>>(
            // Vacía no es un aviso aparte: la explicación de arriba tiene que
            // verse también cuando todavía no hay nada.
            estado: switch (controlador.estado) {
              Vacio<List<Notificacion>>() => const ConDatos<List<Notificacion>>([]),
              final e => e,
            },
            alReintentar: controlador.cargarAhora,
            alPedirAcceso: alPedirAcceso,
            conDatos: (lista, {required bool desdeCache}) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                const _SinMensajeria(),
                const SizedBox(height: 16),
                if (desdeCache) const MarcaDeCache(),
                if (lista.isEmpty)
                  const Text(
                    'Todavía no hay avisos. Aquí aparecerán las visitas que rechacen en portería '
                    'y los ingresos de sus visitantes.',
                    style: TextStyle(color: Paleta.textoSuave),
                  ),
                ...lista.map(_FilaDeNotificacion.new),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SinMensajeria extends StatelessWidget {
  const _SinMensajeria();

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline, size: 20, color: t.colorScheme.outline),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$avisosConLaAppAbierta.', style: t.textTheme.titleSmall),
              const SizedBox(height: 2),
              Text(
                'Con la app cerrada no llegan avisos a este teléfono. Al abrirla, aquí verá lo '
                'que pasó con sus visitas.',
                style: t.textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _FilaDeNotificacion extends StatelessWidget {
  const _FilaDeNotificacion(this.n);
  final Notificacion n;

  @override
  Widget build(BuildContext context) {
    final (icono, color) = switch (n.tipo) {
      TipoDeNotificacion.visitaRechazada => (Icons.block_outlined, Paleta.peligroSuave.texto),
      TipoDeNotificacion.ingresoDeVisitante => (Icons.login_outlined, Paleta.exitoSuave.texto),
      TipoDeNotificacion.otra => (Icons.notifications_none, Paleta.neutroSuave.texto),
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icono, color: color),
        title: Text(n.texto),
        subtitle: Text(momentoLegible(n.en)),
      ),
    );
  }
}
