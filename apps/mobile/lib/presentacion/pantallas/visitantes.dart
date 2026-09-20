/// M-4 · la pestaña de visitantes: lo autorizado, lo pendiente y el botón.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// POR QUÉ LA BANDEJA SE VE AQUÍ Y NO EN UN AJUSTE
///
/// Cuando no hay red, la visita se encola. Si eso no se viera, el residente
/// tendría una lista de autorizaciones en la que su visitante NO aparece y un
/// mensaje que ya cerró: creería que se perdió y la volvería a crear. Con una
/// clave de idempotencia nueva, esa segunda sería una visita distinta de verdad.
///
/// Por eso lo pendiente vive junto a lo confirmado, separado y rotulado: son dos
/// cosas distintas y la pantalla no las mezcla en una sola lista donde pareciera
/// que ya están.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LO QUE SE RINDIÓ TAMPOCO SE ESCONDE
///
/// Tras ocho intentos la bandeja deja de reintentar sola. No se borra: se enseña
/// con su último error y un botón. El reintento a mano repite la MISMA clave, así
/// que sigue sin poder duplicar (RN-17).
library;

import 'package:flutter/material.dart';

import '../../dominio/bandeja_de_salida.dart';
import '../../dominio/entidades.dart';
import '../../configuracion/tema.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
import 'comunes.dart';

class PantallaDeVisitantes extends StatelessWidget {
  const PantallaDeVisitantes({
    super.key,
    required this.controlador,
    required this.alPedirAcceso,
    required this.alCrear,
    required this.pendientes,
    required this.alReintentarPendientes,
    required this.ahora,
  });

  final ControladorDeVista<List<Autorizacion>> controlador;
  final VoidCallback alPedirAcceso;
  final VoidCallback alCrear;

  /// Lo que espera en la bandeja. Se recibe ya resuelto: esta pantalla no sabe
  /// reintentar, solo lo enseña.
  final List<EnvioPendiente> pendientes;
  final Future<void> Function() alReintentarPendientes;
  final DateTime ahora;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: AnimatedBuilder(
          animation: controlador,
          builder: (context, _) => VistaConEstado<List<Autorizacion>>(
            estado: controlador.estado,
            alReintentar: controlador.cargarAhora,
            alPedirAcceso: alPedirAcceso,
            mensajeVacio: 'Todavía no ha autorizado a ningún visitante.',
            conDatos: (lista, {required bool desdeCache}) => ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
              children: [
                Text('Mis visitantes', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                const Text(
                  'Lo que el conjunto ya tiene registrado a su nombre.',
                  style: TextStyle(color: Paleta.textoSuave, fontSize: 13),
                ),
                if (desdeCache) ...[const SizedBox(height: 8), const MarcaDeCache()],
                if (pendientes.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _Bandeja(
                    pendientes: pendientes,
                    ahora: ahora,
                    alReintentar: alReintentarPendientes,
                  ),
                ],
                const SizedBox(height: 16),
                ...lista.map((a) => _Fila(a, ahora: ahora)),
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: alCrear,
        icon: const Icon(Icons.person_add_alt),
        label: const Text('Nuevo visitante'),
      ),
    );
  }
}

class _Bandeja extends StatelessWidget {
  const _Bandeja({
    required this.pendientes,
    required this.ahora,
    required this.alReintentar,
  });

  final List<EnvioPendiente> pendientes;
  final DateTime ahora;
  final Future<void> Function() alReintentar;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Paleta.avisoSuave.fondo,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.cloud_upload_outlined, size: 18, color: Paleta.avisoSuave.texto),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${pendientes.length} sin enviar',
                  style: TextStyle(
                    color: Paleta.avisoSuave.texto,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Estas visitas se guardaron en el teléfono y se enviarán solas cuando vuelva la '
            'conexión. Todavía NO están autorizadas: el portero no las verá.',
            style: TextStyle(color: Paleta.avisoSuave.texto, fontSize: 12),
          ),
          const SizedBox(height: 8),
          ...pendientes.map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '· ${p.cuerpo['visitante'] ?? 'Visita'} — encolada ${momentoLegible(p.encoladoEn)}'
                '${p.intentos > 0 ? ' · ${p.intentos} intento(s)' : ''}'
                '${p.ultimoError == null ? '' : ' · ${p.ultimoError}'}',
                style: TextStyle(color: Paleta.avisoSuave.texto, fontSize: 12),
              ),
            ),
          ),
          const SizedBox(height: 4),
          TextButton.icon(
            onPressed: alReintentar,
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Intentar ahora'),
          ),
          Text(
            'Reintentar no duplica: se reenvía con la misma clave y el conjunto devuelve la '
            'visita que ya creó (RN-17).',
            style: TextStyle(color: Paleta.avisoSuave.texto, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila(this.a, {required this.ahora});
  final Autorizacion a;
  final DateTime ahora;

  @override
  Widget build(BuildContext context) {
    final vigente = a.vigenteEn(ahora);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(
          a.permiteAccesoVehicular ? Icons.directions_car_outlined : Icons.how_to_reg_outlined,
        ),
        title: Text(a.visitante),
        subtitle: Text(
          [
            a.tipo,
            if (a.placa != null) a.placa!,
            if (a.acompanantes > 0) '${a.acompanantes} acompañante(s)',
            'hasta ${momentoLegible(a.hasta)}',
          ].join(' · '),
        ),
        trailing: Distintivo(
          texto: vigente ? 'vigente' : a.estado,
          pareja: vigente ? Paleta.exitoSuave : Paleta.neutroSuave,
        ),
      ),
    );
  }
}
