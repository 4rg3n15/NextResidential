/// M-4 · HU-07, HU-08, HU-09 · Crear visitante.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// ES LA ÚNICA PANTALLA QUE ESCRIBE, Y ESO CAMBIA TODO
///
/// Las otras siete leen: si algo sale mal, se reintenta y no ha pasado nada.
/// Aquí un fallo mal resuelto deja al residente sin saber si su visitante podrá
/// entrar, o —peor— crea la visita dos veces y el portero ve dos
/// autorizaciones para la misma persona sin saber cuál vale.
///
/// De ahí las tres decisiones que gobiernan el fichero:
///
/// 1. **La clave de idempotencia se genera al ABRIR el formulario**, no al
///    pulsar. Si se generara al pulsar, el segundo toque del botón —o el
///    reintento tras un fallo de red— llevaría una clave distinta y el servidor
///    crearía una segunda visita. Se genera una vez y sobrevive a los
///    reintentos (RN-17).
/// 2. **El rechazo NO es un error.** Llega como respuesta con su motivo tipado
///    y se pinta como lo que es: una explicación y una salida. El residente
///    tiene que distinguir «llame a la administración» de «corrija esto», y esa
///    distinción la trae el dominio, no el color del recuadro.
/// 3. **Si no hay red, la visita NO se pierde.** Va a la bandeja de salida con
///    su clave, y la pantalla lo dice sin prometer lo que no puede: «quedó
///    pendiente de enviarse», no «creada».
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LO QUE NO SE VALIDA AQUÍ
///
/// La vigencia coherente, la forma del patrón y las cuatro reglas de negocio.
/// Eso es del dominio del servidor, y duplicarlo aquí crearía dos verdades que
/// se separan a la tercera corrección. Aquí se valida **forma**: que haya
/// nombre, que la franja no acabe antes de empezar, que se eligió algún día si
/// se marcó recurrente. Es la misma frontera que en la API entre el DTO y el
/// agregado (§2.7.3), leída desde el cliente.
library;

import 'package:flutter/material.dart';

import '../../dominio/entidades.dart';

/// Qué hacer con la visita compuesta. La pantalla no sabe si irá por red o a la
/// bandeja: eso lo decide quien la monta, y por eso esto es una función.
typedef EnviarVisita = Future<ResultadoDeEnvio> Function(NuevaVisita visita);

/// Los tres desenlaces que la pantalla sabe pintar.
sealed class ResultadoDeEnvio {
  const ResultadoDeEnvio();
}

class EnvioAceptado extends ResultadoDeEnvio {
  const EnvioAceptado({required this.repetida, this.id});

  /// `true` = era un reintento y el servidor devolvió la de antes (RN-17).
  final bool repetida;

  /// La autorización creada. Hace falta para la foto del visitante, que cuelga
  /// de ELLA y no del residente: es de ahí de donde el servidor deriva quién es
  /// el titular del dato (RN-10).
  final String? id;
}

class EnvioRechazado extends ResultadoDeEnvio {
  const EnvioRechazado(this.rechazo);
  final VisitaRechazada rechazo;
}

/// Sin red. La visita quedó guardada con su clave y se reintentará sola.
class EnvioEncolado extends ResultadoDeEnvio {
  const EnvioEncolado();
}

class PantallaDeNuevoVisitante extends StatefulWidget {
  const PantallaDeNuevoVisitante({
    super.key,
    required this.enviar,
    required this.zonas,
    required this.claveDeIdempotencia,
    this.desplazamientoUtcMinutos = -300,
    this.alCapturarRostro,
  });

  final EnviarVisita enviar;

  /// Las zonas del conjunto, para elegir a cuáles podrá entrar el visitante.
  /// Vacía si aún no se han cargado: la pantalla no bloquea por eso.
  final List<ZonaComun> zonas;

  /// **Se recibe ya generada, y ese es el punto.** El widget no la fabrica en
  /// su `initState` porque un `setState` que lo reconstruyera la cambiaría; y
  /// una clave que cambia deja de ser una clave de idempotencia.
  final String claveDeIdempotencia;

  /// Bogotá es −300. Explícito y no deducido del teléfono: un residente de
  /// viaje no debe crear una visita con la franja de otro huso.
  final int desplazamientoUtcMinutos;

  /// CU-02 · se ofrece SOLO cuando la visita quedó creada de verdad. Una foto
  /// de una visita encolada no tendría a qué colgarse, y una de una rechazada
  /// sería un dato biométrico recogido para nada.
  /// 15-I · con el FIN de la visita: la plantilla no vive más que ella (RN-11).
  final void Function(String autorizacionId, String nombreDelVisitante, DateTime hasta)?
      alCapturarRostro;

  @override
  State<PantallaDeNuevoVisitante> createState() => _PantallaDeNuevoVisitanteState();
}

class _PantallaDeNuevoVisitanteState extends State<PantallaDeNuevoVisitante> {
  final _formulario = GlobalKey<FormState>();
  final _visitante = TextEditingController();
  final _documento = TextEditingController();
  final _placa = TextEditingController();
  final _observaciones = TextEditingController();
  final _acompanante = TextEditingController();

  late DateTime _desde = _redondeado(DateTime.now().add(const Duration(minutes: 30)));
  late DateTime _hasta = _desde.add(const Duration(hours: 4));

  final List<String> _acompanantes = [];
  final Set<String> _zonasElegidas = {};
  bool _vehicular = false;
  bool _recurrente = false;
  final Set<DiaDeSemana> _dias = {};
  TimeOfDay _inicio = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _fin = const TimeOfDay(hour: 18, minute: 0);

  bool _enviando = false;
  ResultadoDeEnvio? _desenlace;

  static DateTime _redondeado(DateTime d) =>
      DateTime(d.year, d.month, d.day, d.hour, d.minute - (d.minute % 15));

  @override
  void dispose() {
    for (final c in [_visitante, _documento, _placa, _observaciones, _acompanante]) {
      c.dispose();
    }
    super.dispose();
  }

  PatronDeVisita? get _patron => !_recurrente
      ? null
      : PatronDeVisita(
          dias: _dias,
          minutoInicio: _inicio.hour * 60 + _inicio.minute,
          minutoFin: _fin.hour * 60 + _fin.minute,
          desplazamientoUtcMinutos: widget.desplazamientoUtcMinutos,
        );

  Future<void> _enviar() async {
    if (!(_formulario.currentState?.validate() ?? false)) return;
    if (_recurrente && !(_patron?.esValido ?? false)) {
      setState(() => _desenlace = null);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Elija al menos un día y una franja que termine después de empezar.')),
      );
      return;
    }

    setState(() {
      _enviando = true;
      _desenlace = null;
    });
    try {
      final r = await widget.enviar(
        NuevaVisita(
          visitante: _visitante.text.trim(),
          documento: _vacioANulo(_documento.text),
          desde: _desde,
          hasta: _hasta,
          placa: _vacioANulo(_placa.text)?.toUpperCase(),
          permiteAccesoVehicular: _vehicular,
          acompanantes: List.unmodifiable(_acompanantes),
          zonasPermitidas: List.unmodifiable(_zonasElegidas),
          observaciones: _vacioANulo(_observaciones.text),
          patron: _patron,
          claveDeIdempotencia: widget.claveDeIdempotencia,
        ),
      );
      if (!mounted) return;
      setState(() => _desenlace = r);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  static String? _vacioANulo(String s) => s.trim().isEmpty ? null : s.trim();

  /// La foto se ofrece solo con una autorización REAL detrás. Sin identificador
  /// —una visita encolada— no hay a qué colgarla, y el servidor no sabría a
  /// quién pedirle el consentimiento.
  bool get _ofreceFoto {
    final d = _desenlace;
    return widget.alCapturarRostro != null && d is EnvioAceptado && d.id != null;
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Nuevo visitante')),
      body: Form(
        key: _formulario,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            if (_desenlace != null) ...[
              _Desenlace(resultado: _desenlace!, alCerrar: () => setState(() => _desenlace = null)),
              if (_ofreceFoto) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () => widget.alCapturarRostro!(
                    (_desenlace! as EnvioAceptado).id!,
                    _visitante.text.trim(),
                    _hasta,
                  ),
                  icon: const Icon(Icons.photo_camera_outlined),
                  // No dice «registrar rostro»: dice de quién es el permiso,
                  // porque es lo que el residente tiene que entender antes de
                  // fotografiar a alguien (RN-10).
                  label: const Text('Tomar su foto y pedirle el permiso'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
                ),
              ],
              const SizedBox(height: 16),
            ],

            // ── Quién viene ────────────────────────────────────────────────
            TextFormField(
              controller: _visitante,
              decoration: const InputDecoration(
                labelText: 'Nombre del visitante',
                helperText: 'Como aparece en su documento',
              ),
              textCapitalization: TextCapitalization.words,
              validator: (v) =>
                  (v == null || v.trim().length < 3) ? 'Escriba el nombre del visitante' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _documento,
              decoration: const InputDecoration(
                labelText: 'Documento (opcional)',
                // Se dice POR QUÉ conviene, en vez de pedirlo sin explicar: sin
                // documento la lista negra solo se puede cruzar por placa.
                helperText: 'Con él, el conjunto puede comprobar la lista negra',
              ),
            ),

            const SizedBox(height: 24),
            _Titulo('¿Cuándo?'),
            _SelectorDeInstante(
              etiqueta: 'Desde',
              valor: _desde,
              alCambiar: (d) => setState(() {
                _desde = d;
                // Mantener el `hasta` por detrás del `desde` sería crear una
                // vigencia imposible: se arrastra en vez de dejarla romperse.
                if (!_hasta.isAfter(_desde)) _hasta = _desde.add(const Duration(hours: 4));
              }),
            ),
            _SelectorDeInstante(
              etiqueta: 'Hasta',
              valor: _hasta,
              alCambiar: (d) => setState(() => _hasta = d),
            ),
            if (!_hasta.isAfter(_desde))
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'La visita tiene que terminar después de empezar.',
                  style: TextStyle(color: tema.colorScheme.error),
                ),
              ),

            const SizedBox(height: 24),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _recurrente,
              onChanged: (v) => setState(() => _recurrente = v),
              title: const Text('Se repite'),
              subtitle: const Text('Para quien viene los mismos días, como el servicio doméstico'),
            ),
            if (_recurrente) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  for (final d in DiaDeSemana.values)
                    FilterChip(
                      label: Text(d.corto),
                      tooltip: d.largo,
                      selected: _dias.contains(d),
                      onSelected: (s) => setState(() => s ? _dias.add(d) : _dias.remove(d)),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _SelectorDeHora(
                      etiqueta: 'Entre',
                      valor: _inicio,
                      alCambiar: (h) => setState(() => _inicio = h),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _SelectorDeHora(
                      etiqueta: 'y',
                      valor: _fin,
                      alCambiar: (h) => setState(() => _fin = h),
                    ),
                  ),
                ],
              ),
            ],

            const SizedBox(height: 24),
            _Titulo('¿Viene acompañado?'),
            // HU-08 · NOMBRES, no un contador. Sin identidad por acompañante,
            // RN-02 sería incumplible para todos menos el primero, y alguien en
            // lista negra podría entrar como acompañante sin ser detectado.
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _acompanante,
                    decoration: const InputDecoration(labelText: 'Nombre del acompañante'),
                    textCapitalization: TextCapitalization.words,
                    onSubmitted: (_) => _agregarAcompanante(),
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: _agregarAcompanante,
                  icon: const Icon(Icons.add),
                  tooltip: 'Agregar acompañante',
                ),
              ],
            ),
            if (_acompanantes.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  for (final a in _acompanantes)
                    InputChip(
                      label: Text(a),
                      onDeleted: () => setState(() => _acompanantes.remove(a)),
                    ),
                ],
              ),
            ],

            const SizedBox(height: 24),
            _Titulo('¿En vehículo?'),
            TextFormField(
              controller: _placa,
              decoration: const InputDecoration(
                labelText: 'Placa (opcional)',
                helperText: 'Se guarda normalizada: sin espacios ni guiones',
              ),
              textCapitalization: TextCapitalization.characters,
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _vehicular,
              onChanged: _placa.text.trim().isEmpty
                  // Sin placa no hay acceso vehicular que permitir: el servidor
                  // lo rechazaría con una restricción de base, y es mejor que
                  // el interruptor no se pueda encender que explicarlo después.
                  ? null
                  : (v) => setState(() => _vehicular = v),
              title: const Text('Puede entrar con el vehículo'),
              subtitle: _placa.text.trim().isEmpty ? const Text('Escriba primero la placa') : null,
            ),

            if (widget.zonas.isNotEmpty) ...[
              const SizedBox(height: 24),
              _Titulo('¿Qué zonas podrá usar?'),
              Wrap(
                spacing: 8,
                children: [
                  for (final z in widget.zonas)
                    FilterChip(
                      label: Text(z.nombre),
                      selected: _zonasElegidas.contains(z.id),
                      onSelected: (s) =>
                          setState(() => s ? _zonasElegidas.add(z.id) : _zonasElegidas.remove(z.id)),
                    ),
                ],
              ),
            ],

            const SizedBox(height: 24),
            TextFormField(
              controller: _observaciones,
              maxLines: 3,
              maxLength: 1000,
              decoration: const InputDecoration(
                labelText: 'Observaciones para la portería (opcional)',
              ),
            ),

            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _enviando ? null : _enviar,
              icon: _enviando
                  ? const SizedBox(
                      height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.check),
              label: Text(_enviando ? 'Registrando…' : 'Registrar visita'),
            ),
          ],
        ),
      ),
    );
  }

  void _agregarAcompanante() {
    final nombre = _acompanante.text.trim();
    if (nombre.length < 2) return;
    setState(() {
      _acompanantes.add(nombre);
      _acompanante.clear();
    });
  }
}

/// El desenlace, que es la mitad importante de esta pantalla.
class _Desenlace extends StatelessWidget {
  const _Desenlace({required this.resultado, required this.alCerrar});
  final ResultadoDeEnvio resultado;
  final VoidCallback alCerrar;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return switch (resultado) {
      EnvioAceptado(repetida: final r) => _Recuadro(
          icono: Icons.check_circle_outline,
          color: c.primary,
          titulo: r ? 'Esta visita ya estaba registrada' : 'Visita registrada',
          // Decir «creada» dos veces sería mentir: el servidor devolvió la
          // anterior, no creó otra (RN-17).
          cuerpo: r
              ? 'Se había enviado antes y el conjunto la conservó. No se creó una segunda.'
              : 'La portería ya puede verla.',
          alCerrar: alCerrar,
        ),
      EnvioEncolado() => _Recuadro(
          icono: Icons.cloud_off_outlined,
          color: c.tertiary,
          titulo: 'Quedó pendiente de enviarse',
          // No se dice «creada». No lo está, y prometerlo haría que el
          // residente mandara a su visitante a una puerta que no se abrirá.
          cuerpo: 'No hay conexión ahora. La app la enviará sola en cuanto vuelva, '
              'y no la duplicará aunque lo intente varias veces.',
          alCerrar: alCerrar,
        ),
      EnvioRechazado(rechazo: final r) => _Recuadro(
          icono: r.motivo.salida == SalidaDelRechazo.hableConLaAdministracion
              ? Icons.info_outline
              : Icons.edit_outlined,
          color: c.error,
          titulo: switch (r.motivo.salida) {
            // La diferencia que el residente NECESITA: una la resuelve la
            // administración y la otra la resuelve él, aquí mismo.
            SalidaDelRechazo.hableConLaAdministracion => 'No se pudo registrar',
            SalidaDelRechazo.corrijaElFormulario => 'Corrija un dato y vuelva a intentar',
          },
          cuerpo: r.explicacion,
          alCerrar: alCerrar,
        ),
    };
  }
}

class _Recuadro extends StatelessWidget {
  const _Recuadro({
    required this.icono,
    required this.color,
    required this.titulo,
    required this.cuerpo,
    required this.alCerrar,
  });

  final IconData icono;
  final Color color;
  final String titulo;
  final String cuerpo;
  final VoidCallback alCerrar;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icono, color: color),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(titulo, style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 4),
                  Text(cuerpo),
                ],
              ),
            ),
            IconButton(onPressed: alCerrar, icon: const Icon(Icons.close), tooltip: 'Cerrar aviso'),
          ],
        ),
      ),
    );
  }
}

class _Titulo extends StatelessWidget {
  const _Titulo(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(texto, style: Theme.of(context).textTheme.titleSmall),
      );
}

class _SelectorDeInstante extends StatelessWidget {
  const _SelectorDeInstante({
    required this.etiqueta,
    required this.valor,
    required this.alCambiar,
  });

  final String etiqueta;
  final DateTime valor;
  final ValueChanged<DateTime> alCambiar;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(etiqueta),
        subtitle: Text(_legible(valor)),
        trailing: const Icon(Icons.event),
        onTap: () async {
          final fecha = await showDatePicker(
            context: context,
            initialDate: valor,
            firstDate: DateTime.now().subtract(const Duration(days: 1)),
            lastDate: DateTime.now().add(const Duration(days: 365)),
          );
          if (fecha == null || !context.mounted) return;
          final hora = await showTimePicker(
            context: context,
            initialTime: TimeOfDay.fromDateTime(valor),
          );
          if (hora == null) return;
          alCambiar(DateTime(fecha.year, fecha.month, fecha.day, hora.hour, hora.minute));
        },
      );

  static String _legible(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} '
      '· ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

class _SelectorDeHora extends StatelessWidget {
  const _SelectorDeHora({required this.etiqueta, required this.valor, required this.alCambiar});
  final String etiqueta;
  final TimeOfDay valor;
  final ValueChanged<TimeOfDay> alCambiar;

  @override
  Widget build(BuildContext context) => OutlinedButton(
        onPressed: () async {
          final h = await showTimePicker(context: context, initialTime: valor);
          if (h != null) alCambiar(h);
        },
        child: Text(
          '$etiqueta ${valor.hour.toString().padLeft(2, '0')}:'
          '${valor.minute.toString().padLeft(2, '0')}',
        ),
      );
}
