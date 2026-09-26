// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'patron_de_visita_dto.g.dart';

@JsonSerializable()
class PatronDeVisitaDto {
  const PatronDeVisitaDto({
    required this.dias,
    required this.minutoInicio,
    required this.minutoFin,
    required this.desplazamientoUtcMinutos,
  });
  
  factory PatronDeVisitaDto.fromJson(Map<String, Object?> json) => _$PatronDeVisitaDtoFromJson(json);
  
  /// 0=domingo … 6=sábado
  final List<num> dias;
  final num minutoInicio;
  final num minutoFin;

  /// Informativo: se valida y se descarta. La franja es hora local de la copropiedad y se evalúa con SU zona horaria, no con la del teléfono.
  final num desplazamientoUtcMinutos;

  Map<String, Object?> toJson() => _$PatronDeVisitaDtoToJson(this);
}
