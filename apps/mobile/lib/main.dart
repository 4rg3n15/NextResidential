/// Arranque de la app del residente.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// FALLA RUIDOSAMENTE, COMO LA API
///
/// §2.7.1: si falta una variable, la aplicación no arranca. En un móvil «no
/// arrancar» no puede ser un `exit(1)` —el usuario vería un cierre sin
/// explicación—, así que la app arranca en una pantalla que dice exactamente
/// qué falta y cómo pasarlo. Y si lo que llega es **una llave secreta**, eso sí
/// es una pantalla de bloqueo: un binario distribuido con la llave que omite la
/// RLS es el proyecto entero regalado.
library;

import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'aplicacion/sesion_en_uso.dart';
import 'configuracion/ambiente.dart';
import 'dominio/puertos.dart';
import 'infraestructura/api/generado/clients/cuentas_api.dart';
import 'infraestructura/api/generado/clients/residente_api.dart';
import 'infraestructura/api/hogar_api.dart';
import 'infraestructura/api/repositorio_api.dart';
import 'infraestructura/camara/camara_del_telefono.dart';
import 'infraestructura/notificaciones/fuente.dart';
import 'infraestructura/plataforma/telefono_y_compartir.dart';
import 'infraestructura/sesion/almacen_seguro.dart';
import 'infraestructura/sesion/autenticador_por_api.dart';
import 'infraestructura/sesion/autenticador_supabase.dart';
import 'presentacion/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final ambiente = Ambiente.deCompilacion();

  final problemas = ambiente.aserciones();
  if (problemas.isNotEmpty) {
    runApp(PantallaDeArranqueBloqueado(problemas: problemas));
    return;
  }

  const reloj = RelojDelSistema();
  // En web no hay Keychain ni Keystore: `flutter_secure_storage` cae a
  // `localStorage`, que es menos seguro. El destino web existe para el
  // recorrido de esta etapa, así que allí se usa memoria —la sesión no
  // sobrevive a la recarga y eso se declara— en vez de fingir un llavero.
  final almacen = kIsWeb ? AlmacenEnMemoria() : AlmacenSeguroDeSesion();

  // D1 · se ENTRA por la API (código + usuario, o correo) y se RENUEVA contra
  // el proveedor. El `Dio` del acceso no lleva el interceptor de sesión: es la
  // petición que la crea, no una que la use.
  final sesion = SesionEnUso(
    almacen: almacen,
    autenticador: AutenticadorPorApi(
      api: CuentasApi(Dio(BaseOptions(baseUrl: ambiente.apiUrl))),
      renovacion: AutenticadorSupabase(
        dio: Dio(),
        urlBase: ambiente.supabaseUrl,
        clavePublicable: ambiente.supabaseClavePublicable,
      ),
    ),
    reloj: reloj,
  );
  await sesion.recuperar();

  final dio = crearDioDeApi(urlBase: ambiente.apiUrl, sesion: sesion);
  final api = ResidenteApi(dio);
  final repositorio = RepositorioApiDelResidente(api: api, sesion: sesion);

  runApp(
    AppDelResidente(
      dependencias: Dependencias(
        ambiente: ambiente,
        sesion: sesion,
        repositorio: repositorio,
        reloj: reloj,
        notificaciones: SinServicioDeMensajeria(identidad: IdentidadDelAparato()),
        claves: claveDeIdempotencia,
        alta: AltaPorApi(api: api, sesion: sesion),
        hogar: HogarPorApi(api: api, sesion: sesion),
        // El cambio de contraseña va CON la sesión: su `Dio` es el de la API.
        cuenta: CuentaPorApi(api: CuentasApi(dio)),
        llamador: const LlamadorDelSistema(),
        compartidor: const CompartidorDelSistema(),
        // Hito 3 · la foto real del visitante, reducida en el aparato. En web
        // (el recorrido del verificador) no hay cámara que abrir: la simulada.
        tomarFoto: kIsWeb ? null : CamaraDelTelefono().tomar,
      ),
    ),
  );
}

/// Una clave de idempotencia por visita.
///
/// La genera el cliente y no el servidor, y ese es el punto: si la pidiera al
/// servidor, la petición que la trae podría perderse igual que la que crea la
/// visita, y no habría con qué reconocer el reintento. Es azar del sistema, no
/// `DateTime.now()`: dos teléfonos con el reloj sincronizado pulsando a la vez
/// no pueden producir la misma.
String claveDeIdempotencia() {
  final azar = Random.secure();
  final bytes = List<int>.generate(16, (_) => azar.nextInt(256));
  return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}

/// Lo que se ve si la compilación trae algo que no debe.
class PantallaDeArranqueBloqueado extends StatelessWidget {
  const PantallaDeArranqueBloqueado({super.key, required this.problemas});
  final List<String> problemas;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.dangerous_outlined, size: 56, color: Color(0xFFDC3341)),
                const SizedBox(height: 16),
                const Text(
                  'La app no puede arrancar con esta configuración',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                ...problemas.map(
                  (p) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(p, textAlign: TextAlign.center),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
