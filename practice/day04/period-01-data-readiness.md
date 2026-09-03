# 1교시 연습 — Data View·Discover·KQL·데이터 준비 상태

공통 문제는 강사님 배포 데이터 `products`로, 개인 문제는 내 PBL index `flights`로 했다.
실행 2026-09-03, Elasticsearch/Kibana 9.5.0.

> **먼저 적어두는 차이점.** 문제지는 `products` 20,000건을 전제하는데 내 클러스터에는
> **10,000건**이 들어 있다. day-02에서 배포된 파일이 `products-10000.ndjson`이라 그렇다.
> 아래 수치는 교재 숫자를 베끼지 않고 내 클러스터에서 확인한 값을 적었다.

## (공통·필수) 문제 1 — Dashboard를 만들 수 있는 데이터인지 확인

### 결과 입력

- 선택한 Data View 이름: **`쇼핑몰 상품 데이터`** (Kibana에 없어서 새로 만들었다)
- index pattern: `products`
- time field: `created_at`
- 확인한 7개 field: `product_id`(keyword), `name`(text+keyword), `category`(keyword),
  `brand`(keyword), `price`(integer), `in_stock`(boolean), `created_at`(date).
  이 외에 `description`(text), `rating`(float), `review_count`(integer), `tags`(keyword),
  `updated_at`(date)까지 총 12개가 mapping에 있다.
- 사용한 절대 시간 범위: 2025-08-01 00:00 ~ 2026-09-01 00:00.
  `created_at` 실제 범위가 2025-08-27T00:22:50Z ~ 2026-08-26T23:55:23Z라 이 범위면 전부 들어온다.
- Discover 실제 문서 수: **10,000**
- 정상/보류/오류: **보류**
- 판정 근거: Data View·time field·field 구성은 전부 정상이다. 문서 수만 교재 기준(20,000)과
  다르다. `GET /products/_count`가 10,000을 돌려주므로 화면이 틀린 게 아니라 적재된
  데이터가 10,000건이다. 강사님께 20,000건 데이터를 따로 받는지 확인이 필요해 보류로 뒀다.
- 캡처 파일: `picture/p01-q01-dataview.png` (Data View 상세),
  `picture/p01-q01-discover-10000.png` (Discover 10,000건)

**Data View가 없어서 먼저 만들었다.** Saved Objects를 확인하니 `flights*` 하나뿐이라
Discover에서 `products`를 열 수가 없었다. index pattern `products`, time field
`created_at`으로 만들고 기본값으로 지정했다. Fields는 18개로 잡힌다.

```
실제 mapping 12 + name.keyword 1 + 메타 5(_id·_ignored·_index·_score·_source) = 18
```

**시간 범위 주의.** 기본값 `Last 15 minutes`로 두면 0건이 나온다. `Last 1 year`도 안 된다.
데이터가 정확히 1년치라 now-1y 이전 문서 193건이 잘려 9,807건만 보인다. 절대 범위로
넉넉히 잡아야 10,000이 나온다.

## (공통·필수) 문제 2 — KQL 적용 전후를 비교

### 비교 결과

| 확인 항목 | 적용 전 | 적용 후 | KQL 제거 후 |
|---|---:|---:|---:|
| 문서 수 | 10,000 | **1,531** | 10,000 |

- 적용 후 대표 문서 ID 2개: Discover 화면 상위 2건이다.

| product_id | brand | category | price | in_stock |
|---|---|---|---:|---|
| `P-09974` | MildLeaf | 뷰티 | 57,900 | false |
| `P-09968` | HappyTail | 반려동물 | 98,400 | false |

  두 건을 `ids` 쿼리로 다시 조회해 `in_stock`이 실제로 `false`인 것을 확인했다.

- `in_stock` 값 확인: 화면에 나온 문서가 전부 `in_stock false`다. `true` 문서는 8,469건으로
  따로 세었고 1,531 + 8,469 = 10,000으로 맞는다.
- 복구 성공 여부: 성공. KQL을 지우니 10,000으로 돌아왔다.
- 캡처 파일: `picture/p01-q02-kql-instock-false.png`
  (Data view `쇼핑몰 상품 데이터`, KQL `in_stock : false`, Documents 1,531 표시)
- KQL이 데이터를 삭제한 것인가? 이유: **아니다.** KQL은 조회 조건일 뿐이고 index를 건드리지
  않는다. 근거는 두 가지다. 첫째, 조건을 지우자 10,000으로 그대로 복구됐다. 삭제였다면
  돌아올 수 없다. 둘째, `in_stock:false` 1,531건과 `true` 8,469건을 각각 세면 합이 원래
  전체와 같다. 사라진 문서가 없다는 뜻이다.

## (진단·필수) 문제 3 — 0건 또는 일부 데이터만 보이는 상황 복구

### 진단 기록

- 재현한 증상: 두 가지를 실제로 재현하고 캡처했다.

| 시간 범위 | Discover | `_count` 대조 |
|---|---:|---:|
| `Last 15 minutes` | **0건** | 0 |
| `Last 1 year` | **9,804건** | 9,804 |
| 절대 범위 2025-08-01 ~ 2026-09-01 | **10,000건** | 10,000 |

  `Last 1 year`는 실행 시각에 따라 조금씩 달라진다. 앞서 캡처한 대시보드에서는 9,818,
  이번 측정에서는 9,804였다. now가 흘러가면서 잘리는 문서가 늘기 때문이다.
- 마지막 정상 상태: 절대 범위 2025-08-01 ~ 2026-09-01, KQL·filter 없음, 10,000건.
- 확인한 항목과 순서:
  1. **시간 범위** — `Last 15 minutes`. `created_at` 최대값이 2026-08-26이라 최근 15분에
     들어오는 문서가 없다. 여기서 원인이 잡혔다. (`p01-q03-time-15m-zero.png`)
  2. Data View — `products` 맞음. index pattern도 맞음.
  3. KQL — 비어 있음.
  4. filter pill — 없음.
  5. field 존재 — `_mapping`으로 `created_at`이 date인 것 확인.
- 발견한 원인: **시간 범위.** index가 지워진 게 아니었다. `Last 1 year`로도 부족했던 이유는
  데이터가 딱 1년치(2025-08-27 ~ 2026-08-26)라 now-1y 경계에서 앞쪽 196건이 잘리기 때문이다.
  (`p01-q03-time-1y-partial.png`)
- 수정한 내용: 절대 범위 2025-08-01 00:00 ~ 2026-09-01 00:00으로 변경.
- 수정 후 문서 수: **10,000**
- 다음부터 먼저 확인할 항목: **시간 범위**를 제일 먼저 본다. 0건이 나오면 index가
  지워졌나부터 의심하기 쉬운데 실제로는 시간 범위가 원인인 경우가 대부분이다. `_count`로
  index 전체 건수를 확인하면 index가 살아 있는지 1초 만에 갈린다.

  조건이 걸리는 자리가 여러 곳이라는 것도 같이 기억해야 한다. 5교시 문제 3에서는 KQL을
  안 지운 채 filter를 추가해 값이 틀어진 사고가 났다. 시간 범위·Data View·KQL·filter
  알약·Control이 각각 다른 줄에 있어서, 한 곳만 보면 나머지를 놓친다.
- 캡처 파일: `picture/p01-q03-time-15m-zero.png` (0건),
  `picture/p01-q03-time-1y-partial.png` (9,804건),
  `picture/p01-q01-discover-10000.png` (복구 후 10,000건)

## (개인·필수) 문제 4 — 내 데이터 준비 상태 카드

### 개인 답안

- 내 주제: 해외 왕복 항공권 검색 서비스 (`flights`)
- 한 문서가 의미하는 대상 또는 사건: **판매 중인 왕복 항공권 상품 1건.**
  출발일·노선·좌석등급·숙박일수·가격이 정해진 하나의 상품이다. 판매 기록이 아니라
  카탈로그에 올라간 상품이다.
- Dashboard 사용자: 항공권 상품을 소싱하는 담당자 한 명.
- 사용자가 내릴 판단: 어느 항공사에 어느 노선을 더 요청할지 정한다.
- 첫 분석 질문: "항공사별로 어느 노선을 얼마나 들고 있나?"
- 필요한 field: `airline`(공급자), `arr_airport`(노선), `seat_class`(등급),
  `total_price`(가격), `stay_nights`(기간), `is_direct`(직항), `out_dep_time`(출발일)
- 각 field의 mapping type:

| field | type | 집계 가능 |
|---|---|---|
| `airline` | text + `.keyword` | `.keyword`로만 가능 |
| `arr_airport` / `dep_airport` / `seat_class` / `tags` | keyword | 가능 |
| `total_price` / `stay_nights` | integer | 가능 |
| `is_direct` | boolean | 가능 |
| `out_dep_time` | date | 가능 |
| `route_desc` | text | 집계 불가, 검색용 |

- 실제 존재 여부: 전부 존재한다. `_mapping`으로 확인했다.
- 데이터 문서 수: **10,000**
- A/B/C 중 선택: **A (개인 데이터 사용)**
- 선택 이유: 집계 가능한 keyword가 5개, 숫자 2개, boolean 1개, date 1개라 Metric·Bar·
  Table·Donut·Line·Heatmap을 전부 만들 수 있다. 문서도 10,000건이라 도착지 6 × 항공사 5 =
  30개 조합에 각 303~375건씩 들어가 control을 걸어도 패널이 비지 않는다.
- 부족한 데이터와 다음 행동: `booked_at`(판매 시점)이 없어서 판매 추이를 못 그린다.
  `out_dep_time`은 출발 예정일이라 판매일로 쓰면 안 된다. `seats_sold`/`seats_total`도
  없어서 "물량이 많다"와 "재고가 남는다"를 구분할 수 없다. 6교시 문제 4에서 생성 규칙을
  설계한다.

## (선택 도전) 문제 5 — 서로 다른 KQL 3개 설계

한 번에 하나씩만 실행하고 매번 지운 뒤 다음으로 넘어갔다.

| KQL | 질문 | 결과 수 | 대표 문서 | 조건 제거 후 복구 |
|---|---|---:|---|---|
| `category : "전자기기"` | 전자기기가 몇 개인가 | 1,250 | Discover 상위 문서 | 10,000 |
| `price >= 200000` | 20만원 이상 고가 상품은 | 1,467 | 〃 | 10,000 |
| `in_stock : true` | 지금 살 수 있는 상품은 | 8,469 | 〃 | 10,000 |

세 조건이 각각 keyword·integer·boolean을 쓴다. category 8종이 각 1,250건으로 완전히
균등해서, 어느 카테고리를 넣어도 1,250이 나온다.

`price >= 200000`이 1,467건인데, 가격 구간을 5만 단위로 끊으면 20만 이상 구간과 정확히
같은 값이다(4교시 문제 1에서 다시 확인).

## 교시 완료 신호

**YELLOW.** 필수 1~4를 다 했고 KQL/filter 없는 상태로 복구했지만, 마지막 문서 수가
교재 기준 20,000이 아니라 10,000이다. Data View·field·복구는 전부 정상이고 건수만 다르다.
