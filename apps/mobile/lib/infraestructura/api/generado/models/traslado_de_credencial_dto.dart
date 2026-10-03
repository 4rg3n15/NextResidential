// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'traslado_de_credencial_dto.g.dart';

@JsonSerializable()
class TrasladoDeCredencialDto {
  const TrasladoDeCredencialDto({
    required this.dispositivoId,
    required this.trasladada,
    required this.motivo,
  });
  
  factory TrasladoDeCredencialDto.fromJson(Map<String, Object?> json) => _$TrasladoDeCredencialDtoFromJson(json);
  
  final String dispositivoId;

  /// En el Edge y borrada de la nube
  final bool trasladada;
  final String motivo;

  Map<String, Object?> toJson() => _$TrasladoDeCredencialDtoToJson(this);
}
