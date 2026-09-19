import 'package:flutter/material.dart';

import '../../aplicacion/estado.dart';
import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
import 'comunes.dart';

/// M-2 · Mi Familia — HU-02 (lectura), HU-04.
///
/// Dos cosas que el mockup no resuelve y aquí quedan resueltas:
///
/// **El «nivel de acceso» es `PENDIENTE DE DEFINICIÓN` P-11.** El dibujo
/// muestra «Acceso Completo» y «Solo Ingreso», y ese concepto **no existe en el
/// documento de requisitos**: ni RN, ni HU, ni glosario. Se pinta lo que el
/// servidor manda —con el valor más restrictivo por defecto— y se dice que está
/// sin definir. Inventar una semántica aquí sería peor: la app enseñaría un
/// permiso que el motor de reglas no aplica.
///
/// **El residente desactivado aparece, marcado.** RN-19 prohíbe el borrado
/// físico donde hay historial: existió y sus eventos siguen ahí. Ocultarlo haría
/// creer que nunca estuvo.
///
/// «Agregar miembro» es de 11-B: es una escritura, y las escrituras van con la
/// cámara y el modo sin conexión.
class PantallaDeFamilia extends StatelessWidget {
  const PantallaDeFamilia({
    super.key,
    required this.controlador,
    required this.alPedirAcceso,
  });

  final ControladorDeVista controlador;
  final void Function() alPedirAcceso;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mi familia')),
      body: AnimatedBuilder(
        animation: controlador,
        builder: (context, _) => RefreshIndicator(
          onRefresh: controlador.cargarAhora,
          child: VistaConEstado<List<MiembroDeFamilia>>(
            estado: controlador.estado as Estado<List<MiembroDeFamilia>>,
            alReintentar: controlador.cargarAhora,
            alPedirAcceso: alPedirAcceso,
            mensajeVacio:
                'No hay más residentes registrados en su vivienda. La administración del conjunto '
                'los vincula desde la consola.',
            conDatos: (miembros, {required desdeCache}) => ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (desdeCache) const MarcaDeCache(),
                Text(
                  '${miembros.where((m) => m.activo).length} residente(s) en su vivienda',
                  style: const TextStyle(color: Paleta.textoSuave),
                ),
                const SizedBox(height: 12),
                ...miembros.map((m) => _Miembro(m)),
                const SizedBox(height: 12),
                const _AvisoDeNivelDeAcceso(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Miembro extends StatelessWidget {
  const _Miembro(this.m);
  final MiembroDeFamilia m;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: m.activo ? Paleta.peligroSuave.fondo : Paleta.neutroSuave.fondo,
          child: Text(
            m.nombre.isEmpty ? '?' : m.nombre.characters.first.toUpperCase(),
            style: TextStyle(
              color: m.activo ? Paleta.peligroSuave.texto : Paleta.neutroSuave.texto,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        title: Text(m.nombre),
        subtitle: Text(
          [
            if (m.parentesco != null) m.parentesco!,
            if (m.esTitular) 'Titular',
            if (m.nivelAcceso != null) _nivel(m.nivelAcceso!),
          ].join(' · '),
        ),
        trailing: m.activo
            ? null
            : const Distintivo(texto: 'Desactivado', pareja: Paleta.neutroSuave),
      ),
    );
  }

  String _nivel(String clave) => switch (clave) {
        'acceso_completo' => 'Acceso completo',
        'solo_ingreso' => 'Solo ingreso',
        _ => clave,
      };
}

class _AvisoDeNivelDeAcceso extends StatelessWidget {
  const _AvisoDeNivelDeAcceso();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Paleta.neutroSuave.fondo,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        'El «nivel de acceso» viene del mockup y no de un requisito (P-11, sin definir). Hoy solo '
        'el titular de la vivienda puede autorizar visitantes, como exige RN-05.',
        style: TextStyle(color: Paleta.neutroSuave.texto, fontSize: 13),
      ),
    );
  }
}
