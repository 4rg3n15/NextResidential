// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'orden_de_bloqueo_dto.g.dart';

@JsonSerializable()
class OrdenDeBloqueoDto {
  const OrdenDeBloqueoDto({
    required this.dispositivoId,
    required this.bloqueado,
    required this.motivo,
  });
  
  factory OrdenDeBloqueoDto.fromJson(Map<String, Object?> json) => _$OrdenDeBloqueoDtoFromJson(json);
  
  final String dispositivoId;

  /// Verdadero deja el acceso bloqueado hasta que alguien lo revierta: ninguna autorización abre mientras tanto.
  final bool bloqueado;

  /// Obligatorio (RN-08). Sin motivo NO se bloquea: un acceso bloqueado sin justificación registrada deja al conjunto sin entrada y sin a quién preguntar.
  final String motivo;

  Map<String, Object?> toJson() => _$OrdenDeBloqueoDtoToJson(this);
}
