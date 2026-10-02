// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'lote_del_edge_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LoteDelEdgeDto _$LoteDelEdgeDtoFromJson(Map<String, dynamic> json) =>
    LoteDelEdgeDto(
      eventos: (json['eventos'] as List<dynamic>)
          .map((e) => EventoDelEdgeDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$LoteDelEdgeDtoToJson(LoteDelEdgeDto instance) =>
    <String, dynamic>{'eventos': instance.eventos};
