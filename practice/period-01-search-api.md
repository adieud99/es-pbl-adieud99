# 1교시 실습 — Search API 기본

공통 문제 1~3은 강사님 배포 데이터인 `products` index로, 개인 문제 4~5는 내 PBL index인
`flights`로 실행했다. 실행 시각은 2026-09-02 11:20~11:30 KST, Elasticsearch 9.5.0이다.

## (공통) 문제 1 — 제공 코드 실행·응답 읽기

다음 요청을 실행하세요.

```http
GET /products/_search
{
  "size": 5,
  "query": { "match_all": {} }
}
```

### 결과 입력

- HTTP 성공 여부: 성공. `timed_out`이 `false`이고 `_shards`가 total 3 / successful 3 / failed 0이다.
- `hits.total.value`: 10000
- `hits.hits`에 반환된 문서 수: 5
- 첫 번째 문서의 `_id`: `P-00003`
- 첫 번째 문서의 `_source` field 3개: `product_id` = "P-00003", `name` = "Morrow 실속형 오버핏 후드",
  `price` = 27700 (그 밖에 `category`·`brand`·`rating`·`review_count`·`in_stock`·`tags`·`created_at`·
  `updated_at`까지 12개 field가 모두 들어 있었다)
- `hits.total.value`와 반환 문서 수가 다를 수 있는 이유: 두 값이 세는 대상이 다르다.
  `hits.total.value`는 query에 걸린 문서가 전체 몇 건인지이고, `hits.hits`의 길이는 그중 이번
  응답에 실어 보낸 건수다. `size`가 그 개수를 정한다. `match_all`이라 10,000건이 모두 걸렸지만
  `size: 5`이므로 5건만 왔다. 10,000건을 한 번에 내려보내면 응답이 커지고 느려지기 때문에
  기본적으로 나눠서 가져간다.

첫 문서가 `P-00001`이 아니라 `P-00003`인 점이 눈에 띄었다. `products`는 primary shard가 3개라
문서가 세 shard에 나뉘어 저장되고, 정렬을 주지 않으면 각 shard에서 모은 순서대로 나온다.
`_id` 순서를 보장하려면 `sort`를 직접 줘야 한다.

## (공통) 문제 2 — 반환 개수와 field 직접 구현

`products` index의 전체 문서 중 최대 3건만 반환하고, `_source`에는 `product_id`, `name`, `price`, `in_stock`만 포함하는 Search API를 작성하고 실행하세요.

### API 전체 입력

```http
GET /products/_search
{
  "size": 3,
  "_source": ["product_id", "name", "price", "in_stock"],
  "query": { "match_all": {} }
}
```

### 결과 입력

- 반환 문서 수: 3 (`hits.total.value`는 그대로 10000)
- `_source`에 요구하지 않은 field가 포함됐는가: 포함되지 않았다. 네 field만 왔고
  `category`·`brand`·`rating`·`review_count`·`tags`·`created_at`·`updated_at`은 빠졌다.
  다만 `_id`·`_index`·`_score`는 `_source` 밖의 메타데이터라 `_source`로 제어되지 않는다.
- 검증한 문서 ID: `P-00003`(27,700원·재고 없음), `P-00004`(145,200원·재고 있음),
  `P-00008`(85,100원·재고 없음)

`_source`는 저장된 문서에서 무엇을 꺼내 보낼지 고르는 것이지 검색 대상을 줄이는 것이 아니다.
빠진 field도 index에는 그대로 있고 조건으로 쓸 수 있다.

## (공통) 문제 3 — 정렬이 포함된 전체 조회 구현

`products` index의 전체 문서 중 최대 10건을 `price`가 낮은 순서로 반환하세요. `_source`에는 `product_id`, `name`, `price`만 포함하세요.

### API 전체 입력

```http
GET /products/_search
{
  "size": 10,
  "_source": ["product_id", "name", "price"],
  "query": { "match_all": {} },
  "sort": [
    { "price": "asc" }
  ]
}
```

### 결과 입력

- 첫 3개 문서의 ID와 price: `P-00431` 5,900원 / `P-06599` 5,900원 / `P-06479` 5,900원
  (4위 `P-08895`도 5,900원, 5~8위는 6,100원, 9~10위는 6,200원이었다)
- 오름차순 여부: 오름차순이 맞다. 5,900 → 6,100 → 6,200으로 값이 줄어드는 구간이 없다.
  `max_score`는 `null`이 되고 각 문서에 `sort` 배열이 붙는다. 정렬 키를 주면 점수를 쓰지 않는다.
- 두 문서의 price가 같을 때 순서가 고정된다고 말할 수 있는가? 근거:
  **말할 수 없다.** 상위 10건 안에 이미 5,900원이 4건, 6,100원이 4건 들어 있다. `terms`로 묶어
  세어 보니 16,900원·23,200원·30,800원처럼 같은 값이 9건씩 있는 가격대도 있었다.
  `price` 하나만으로는 이 문서들 사이의 순서가 정해지지 않는다. 실제 결과도 `P-00431` →
  `P-06599` → `P-06479` → `P-08895` 순으로 `_id` 순서가 아니었다. shard가 3개라 어느 shard의
  결과가 먼저 모이는지에 따라 달라질 수 있다. 순서를 고정하려면
  `"sort": [{ "price": "asc" }, { "product_id": "asc" }]`처럼 값이 겹치지 않는 2차 키를 넣어야 한다.

## (개인) 문제 4 — 자기 index의 첫 Search API

자기 index의 전체 문서 중 최대 5건을 반환하는 Search API를 작성하세요.

### 역할·검증 기준

- 실제 자기 index 이름을 사용합니다.
- `_count`와 `hits.total.value`를 비교합니다.
- `size`와 전체 일치 문서 수를 구분해 설명합니다.

### API와 결과 입력

```http
GET /flights/_count

GET /flights/_search
{
  "size": 5,
  "query": { "match_all": {} }
}
```

- 자기 index: `flights` (왕복 항공권 1건이 문서 1건)
- `_count`: 10000
- `hits.total.value`: 10000
- 반환 문서 수: 5 (`TRIP-00001` ~ `TRIP-00005`)
- 판정과 근거: **통과.** `_count`와 `hits.total.value`가 10,000으로 같다. Day 2에 Bulk로 넣은
  건수와도 같으므로 빠지거나 중복된 문서가 없다는 뜻이다. 반환된 5건은 `size`가 정한 값이고
  전체 일치 건수와는 다른 값이다. 두 숫자가 다르다고 해서 문서가 없어진 것이 아니다.
  `_count`는 건수만 세는 API라 문서 본문을 만들지 않고, `_search`는 조건에 맞는 전체 건수를
  세면서 그중 `size`만큼만 실어 보낸다. 답이 몇 건인지와 이번에 몇 건을 가져왔는지는 나눠서 봐야 한다.

`products`와 달리 `flights`는 `TRIP-00001`부터 순서대로 나왔다. 이 index는 primary shard가
1개라 문서가 한 곳에 모여 있기 때문이다. 정렬을 주지 않았으니 이것도 보장된 순서는 아니다.

## (개인) 문제 5 — 결과 카드 field 설계

자기 서비스에서 검색 결과 카드 한 개를 보여 준다고 가정하세요. 사용자가 클릭 여부를 결정하는 데 필요한 field 3~5개만 반환하는 Search API를 작성하세요.

### 역할·검증 기준

- 선택한 field가 자기 mapping과 실제 문서에 존재해야 합니다.
- 식별자, 제목 역할, 판단용 정보가 포함되어야 합니다.
- 불필요한 field를 하나 이상 제외하고 이유를 설명합니다.

### API와 결과 입력

```http
GET /flights/_search
{
  "size": 3,
  "_source": ["trip_id", "route_desc", "airline", "out_dep_time", "total_price"],
  "query": { "match_all": {} }
}
```

- 포함한 field와 이유:

| field | 카드에서 맡는 역할 | 이유 |
|---|---|---|
| `trip_id` | 식별자 | 이 카드가 어느 항공권인지 가리킨다. 문의하거나 다시 찾을 때 이 값으로 말한다 |
| `route_desc` | 제목 | "인천 도쿄 왕복 직항" 한 줄로 어디를 어떻게 가는지가 다 드러난다. 카드에서 가장 먼저 읽는 줄이다 |
| `airline` | 판단 | 같은 노선·같은 가격이면 항공사로 고른다. 사용자마다 선호가 갈리는 값이다 |
| `out_dep_time` | 판단 | 출발 일시가 자기 일정과 맞지 않으면 가격이 싸도 소용이 없다. 새벽 출발인지 아닌지도 여기서 갈린다 |
| `total_price` | 판단 | 예산 안에 드는지가 클릭 여부를 가장 크게 좌우한다 |

- 제외한 field와 이유:

  - `is_direct`: `route_desc`에 이미 "직항"·"경유"가 들어 있다. 같은 정보를 두 번 보여줄
    이유가 없다. 조건으로 걸 때는 boolean이 필요하지만 화면에 내보낼 필요는 없다.
  - `dep_airport`: 이 데이터는 전부 `ICN`이다. 모든 카드에 같은 값이 찍히면 고르는 데 아무
    도움이 되지 않는다. 나중에 출발 공항이 여러 곳으로 늘어나면 다시 넣어야 한다.
  - `arr_airport`: 도착 도시는 `route_desc`에 이름으로 들어 있다. `NRT`라는 코드보다 "도쿄"가
    사용자에게 읽힌다. 공항 코드는 조건과 집계용이다.
  - `stay_nights`·`seat_class`·`tags`: 카드가 아니라 상세 화면이나 필터에 어울린다. 카드에
    다 넣으면 정작 봐야 할 가격과 출발 시각이 묻힌다.

- 실제 반환 문서 ID: `TRIP-00001` (인천 도쿄 왕복 경유·티웨이항공·2026-09-15T23:46:28Z·924,066원),
  `TRIP-00002` (인천 도쿄 왕복 직항·제주항공·2026-09-29T05:08:12Z·681,380원),
  `TRIP-00003` (인천 싱가포르 왕복 직항·대한항공·2026-09-28T06:48:17Z·1,139,520원)

- 완료 판정: **통과.** 선택한 5개 field가 모두 `elasticsearch/index-create.json`의 mapping에
  있고 실제 문서에서도 값이 나왔다. 식별자(`trip_id`)·제목(`route_desc`)·판단용 정보
  (`airline`·`out_dep_time`·`total_price`)가 각각 들어갔고, 12개 중 5개만 남겨 7개를 제외했다.
  반환된 3건을 실제로 읽어 보니 노선·항공사·출발 일시·가격이 한 줄씩으로 비교가 됐다.
