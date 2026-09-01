# Dashboard 계획

## 1. Dashboard 사용자와 목적

- Dashboard를 볼 사용자: 출발일과 체류일수를 정하지 못한 여행객
- 이 사용자가 확인하려는 상황: 노선별 총액 수준과 체류일수에 따른 총액 변화
- Dashboard를 본 뒤 할 다음 행동:
  총액이 낮게 형성되는 노선과 체류일수를 확인하고 출발일을 조정한다.

## 2. 분석 질문

1. 노선별 평균 왕복 총액은 얼마인가?
2. 체류일수별 평균 왕복 총액은 얼마인가?

## 3. 차트 아이디어 초안

| 차트 아이디어 | 답할 질문 | 사용할 field 후보 |
|---|---|---|
| 노선별 평균 총액 막대 차트 | 어느 노선이 상대적으로 싼가? | `arr_airport`, `total_price` |
| 좌석등급 비율 차트 | 이코노미 좌석은 얼마나 되는가? | `seat_class` |

> 평가 최소 기준은 차트 2개 이상이지만, 수업에서는 차트 4개를 완성합니다.

## 4. Control과 시간 설정

- Options list 또는 range control에 사용할 field:
  Options list — `arr_airport`(도착 공항), `seat_class`(좌석등급), `is_direct`(직항 여부)
  Range slider — `total_price`(왕복 총액), `stay_nights`(체류일수)

- 이 control로 함께 좁힐 차트:
  노선별 평균 총액 막대 차트, 체류일수별 평균 총액 차트.
  좌석등급과 직항 여부가 섞인 채로 평균을 내면 사용자가 어느 조합이 싼지 판단할 수 없다.
  도착 공항이 6개이므로 특정 노선만 보고 싶을 때도 control이 필요하다.

- Data View 이름: `flights`

- 시간 field: 사용

- 시간 field를 사용한다면 field 이름과 기간:
  `out_dep_time`(가는 편 출발 일시), 기간은 2026-09-01 ~ 2026-09-30

  왕복이지만 날짜 field는 `out_dep_time` 하나다. 사용자가 기준 삼는 것은 "언제 떠나는가"이고,
  돌아오는 날짜는 체류일수로 표현된다.

## 5. 제목과 배치 계획

- Dashboard 제목: 왕복 항공권 총액 분석

- 상단에 둘 차트 또는 control:
  `arr_airport`·`seat_class` options list, `total_price` range slider,
  그리고 조건에 맞는 항공권 건수를 보여 주는 Metric

- 가운데에 둘 차트:
  노선별 평균 왕복 총액 막대 차트, 체류일수별 평균 총액 차트

- 하단에 둘 차트:
  가는 편 출발 시간대별 항공권 수 차트

control을 상단에 두는 이유는 사용자가 차트를 읽기 전에 범위를 좁히는 순서가 되어야 하기
때문이다. 아래에 두면 차트를 먼저 보고 나중에 좁히는 꼴이 되어 순서가 뒤집힌다.

## 6. Day 4 완료 기록

- 실제로 만든 차트 수:
- Dashboard 화면 캡처: `evidence/dashboard.png`
- 선택 export: `kibana/dashboard.ndjson`
- 계획과 다르게 바꾼 점 및 이유:
