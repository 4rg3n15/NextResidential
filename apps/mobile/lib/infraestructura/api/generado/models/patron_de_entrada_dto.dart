// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'patron_de_entrada_dto.g.dart';

@JsonSerializable()
class PatronDeEntradaDto {
  const PatronDeEntradaDto({
    required this.dias,
    required this.minutoInicio,
    required this.minutoFin,
    required this.desplazamientoUtcMinutos,
  });
  
  factory PatronDeEntradaDto.fromJson(Map<String, Object?> json) => _$PatronDeEntradaDtoFromJson(json);
  
  /// Días de la semana, 0..6 con domingo = 0 (RN-22).
  final List<num> dias;
  final num minutoInicio;
  final num minutoFin;

  /// Desfase UTC en minutos de la copropiedad; el patrón es local, no UTC.
  final num desplazamientoUtcMinutos;

  Map<String, Object?> toJson() => _$PatronDeEntradaDtoToJson(this);
}
