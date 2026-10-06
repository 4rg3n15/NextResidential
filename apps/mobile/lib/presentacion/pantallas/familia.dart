import 'package:flutter/material.dart';

import '../../aplicacion/estado.dart';
import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../../dominio/menores.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
import '../widgets/fila_de_menor.dart';
import 'comunes.dart';

export '../widgets/fila_de_menor.dart' show AccionesSobreMenores;

/// M-2 · Mi Familia — HU-02 (lectura), HU-04, y los menores del hogar (RONDA
/// 15-W, D-W2).
///
/// Tres cosas que el mockup no resuelve y aquí quedan resueltas:
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
/// **Los menores, sin cuenta, los gestiona cualquier adulto (15-W).** Son
/// residentes, así que vienen en la lista de la familia; la lectura de menores
/// añade lo suyo —edad, documento enmascarado, plaza— y sus acciones. Se cruzan
/// por `residenteId` para que nadie aparezca dos veces. Si esa lectura falla,
/// la familia se sigue viendo y se dice qué faltó.
class PantallaDeFamilia extends StatelessWidget {
  const PantallaDeFamilia({
    super.key,
    required this.controlador,
    required this.alPedirAcceso,
    this.menores,
    this.acciones,
  });

  final ControladorDeVista controlador;
  final void Function() alPedirAcceso;

  /// 15-W · `null` = sin gestión de menores (las pruebas de 11-A la montan así).
  final ControladorDeVista<List<MenorDelHogar>>? menores;
  final AccionesSobreMenores? acciones;

  Future<void> _recargar() async {
    await Future.wait([controlador.refrescar(), if (menores != null) menores!.refrescar()]);
  }

  @override
  Widget build(BuildContext context) {
    final a = acciones;
    return Scaffold(
      appBar: AppBar(title: const Text('Mi familia')),
      body: AnimatedBuilder(
        animation: Listenable.merge([controlador, ?menores]),
        builder: (context, _) => RefreshIndicator(
          onRefresh: _recargar,
          child: VistaConEstado<List<MiembroDeFamilia>>(
            estado: controlador.estado as Estado<List<MiembroDeFamilia>>,
            alReintentar: controlador.cargarAhora,
            alPedirAcceso: alPedirAcceso,
            mensajeVacio:
                'No hay más residentes registrados en su vivienda. La administración del conjunto '
                'los vincula desde la consola.',
            conDatos: (miembros, {required desdeCache}) => _Lista(
              miembros: miembros,
              desdeCache: desdeCache,
              menores: menores?.estado,
              acciones: a,
            ),
          ),
        ),
      ),
      floatingActionButton: a == null
          ? null
          : FloatingActionButton.extended(
              key: const Key('familia.anadirMenor'),
              onPressed: a.alAnadir,
              icon: const Icon(Icons.child_care_outlined),
              label: const Text('Añadir menor'),
            ),
    );
  }
}

class _Lista extends StatelessWidget {
  const _Lista({
    required this.miembros,
    required this.desdeCache,
    required this.menores,
    required this.acciones,
  });

  final List<MiembroDeFamilia> miembros;
  final bool desdeCache;
  final Estado<List<MenorDelHogar>>? menores;
  final AccionesSobreMenores? acciones;

  @override
  Widget build(BuildContext context) {
    final (lista, falloDeMenores) = switch (menores) {
      ConDatos(datos: final d) => (d, false),
      Cargando(previo: final p) => (p ?? const <MenorDelHogar>[], false),
      Fallido(previo: final p) => (p ?? const <MenorDelHogar>[], true),
      _ => (const <MenorDelHogar>[], false),
    };
    final porId = {for (final m in lista) m.residenteId: m};
    final enLaFamilia = miembros.map((m) => m.residenteId).toSet();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
      children: [
        if (desdeCache) const MarcaDeCache(),
        Text(
          '${miembros.where((m) => m.activo).length} residente(s) en su vivienda',
          style: const TextStyle(color: Paleta.textoSuave),
        ),
        const SizedBox(height: 12),
        for (final m in miembros)
          if (porId[m.residenteId] case final menor?)
            FilaDeMenor(menor: menor, acciones: acciones)
          else
            _Miembro(m),
        // Un menor que la lista de la familia aún no trae no se esconde.
        for (final menor in lista)
          if (!enLaFamilia.contains(menor.residenteId))
            FilaDeMenor(menor: menor, acciones: acciones),
        if (falloDeMenores)
          Text(
            'No se pudieron cargar los datos de los menores. Tire hacia abajo para reintentar.',
            style: TextStyle(color: Paleta.peligroSuave.texto, fontSize: 13),
          ),
        const SizedBox(height: 12),
        if (acciones != null) ...[
          const _Aviso(
            'Los menores de edad no tienen cuenta: cualquier adulto de la vivienda los registra '
            'en una plaza libre.',
          ),
          const SizedBox(height: 8),
        ],
        const _Aviso('Hoy sólo el titular de la vivienda puede autorizar visitantes.'),
      ],
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

class _Aviso extends StatelessWidget {
  const _Aviso(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Paleta.neutroSuave.fondo,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(texto, style: TextStyle(color: Paleta.neutroSuave.texto, fontSize: 13)),
    );
  }
}
