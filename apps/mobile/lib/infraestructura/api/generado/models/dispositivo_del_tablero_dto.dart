// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dispositivo_del_tablero_dto_estado.dart';
import 'dispositivo_del_tablero_dto_tipo.dart';
import 'dispositivo_del_tablero_dto_ultimo_resultado_de_sincronizacion.dart';

part 'dispositivo_del_tablero_dto.g.dart';

@JsonSerializable()
class DispositivoDelTableroDto {
  const DispositivoDelTableroDto({
    required this.id,
    required this.nombre,
    required this.tipo,
    required this.zonaId,
    required this.host,
    required this.puerto,
    required this.modelo,
    required this.firmware,
    required this.estado,
    required this.ultimoLatido,
    required this.ultimaSincronizacion,
    required this.segundosSinLatir,
    required this.ultimoResultadoDeSincronizacion,
    required this.sincronizacionesFallidas,
  });
  
  factory DispositivoDelTableroDto.fromJson(Map<String, Object?> json) => _$DispositivoDelTableroDtoFromJson(json);
  
  final String id;
  final String nombre;
  final DispositivoDelTableroDtoTipo tipo;
  final String? zonaId;

  /// IP o FQDN del equipo. Solo se rellena para roles administrativos (C-11); para el resto llega null. NUNCA sale la credencial ni su referencia (RN-21).
  final String? host;
  final num? puerto;
  final String? modelo;
  final String? firmware;

  /// Derivado del último latido contra el umbral de la copropiedad (migración 0020), no leído de la columna estado_salud, que puede ir por detrás.
  final DispositivoDelTableroDtoEstado estado;
  final DateTime? ultimoLatido;
  final DateTime? ultimaSincronizacion;
  final num? segundosSinLatir;

  /// Estado de la sincronización de plantilla más reciente de este equipo. Sale de plantilla_sincronizaciones, no de una copia en dispositivos: dos copias del mismo resultado se separan en cuanto alguien reintenta una sola plantilla.
  final DispositivoDelTableroDtoUltimoResultadoDeSincronizacion? ultimoResultadoDeSincronizacion;

  /// Cuántas plantillas siguen sin llegar a este equipo. Distingue «falló la última» de «hay catorce sin llegar».
  final num sincronizacionesFallidas;

  Map<String, Object?> toJson() => _$DispositivoDelTableroDtoToJson(this);
}
