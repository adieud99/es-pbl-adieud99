# 5교시 실습 — bool 검색

공통 문제 1~3은 강사님 배포 데이터인 `products` index로, 개인 문제 4~5는 내 PBL index인
`flights`로 실행했다. 실행 시각은 2026-09-02 12:55~13:15 KST, Elasticsearch 9.5.0이다.

## (공통) 문제 1 — 제공 코드로 must·filter 확인

```http
GET /products/_search
{
  "size": 10,
  "query": {
    "bool": {
      "must": [{ "match": { "name": "무선" } }],
      "filter": [
        { "term": { "category": "전자기기" } },
        { "term": { "in_stock": true } },
        { "range": { "price": { "gte": 50000, "lte": 200000 } } }
      ]
    }
  }
}
```

### 결과 입력

- `hits.total.value`: 74
- 상위 3개 ID·name: `P-00025` "MobiCore 컴팩트 무선 이어폰" / `P-00129` "Auralis 스마트 무선 이어폰" /
  `P-00369` "SoundLab 데일리 무선 이어폰"
- 세 filter의 실제 값:

| ID | category | in_stock | price |
|---|---|---|---:|
| `P-00025` | 전자기기 | true | 59,400 |
| `P-00129` | 전자기기 | true | 53,800 |
| `P-00369` | 전자기기 | true | 162,800 |

  세 건 모두 세 filter를 위반하지 않는다. `name`에도 "무선"이 들어 있어 `must`까지 만족한다.

- must와 filter의 역할 차이: 둘 다 "반드시 만족해야 한다"는 점은 같고, **점수를 매기는지**가
  다르다. `must`의 `match`는 `_score`를 계산해 3.0212545를 만들었지만 `filter`의 세 조건은
  점수에 아무 기여도 하지 않는다. 4교시 문제 1처럼 `filter`만 쓰면 `_score`가 아예 `null`인데,
  여기는 `must`가 있어서 점수가 나온다.

  나눠 쓰는 이유는 두 가지다. 첫째, "무선"은 얼마나 잘 맞는지가 순위에 영향을 줘야 하지만
  카테고리가 전자기기인지는 맞거나 틀리거나 둘 뿐이라 점수로 잴 것이 없다. 둘째, `filter`는
  점수를 계산하지 않아 결과를 캐시할 수 있어 반복 실행이 빠르다. 조건의 성격에 맞게 넣는
  자리가 다르다.

## (공통) 문제 2 — 조건 제거 실험 직접 구현

문제 1의 요청에서 `in_stock` filter만 제거한 API를 작성하세요. 다른 조건은 바꾸지 마세요.

### API 전체 입력

```http
GET /products/_search
{
  "size": 10,
  "_source": ["product_id", "name", "in_stock", "price"],
  "query": {
    "bool": {
      "must": [{ "match": { "name": "무선" } }],
      "filter": [
        { "term": { "category": "전자기기" } },
        { "range": { "price": { "gte": 50000, "lte": 200000 } } }
      ]
    }
  }
}
```

### 비교 결과

- 변경 전 total / 변경 후 total: **74 / 83**. 9건 늘었다.
- 새로 포함된 문서 ID·in_stock: 늘어난 9건은 모두 `in_stock`이 `false`인 문서다.
  같은 조건에 `in_stock: false`를 넣어 따로 세어 보니 정확히 **9건**이었고, 74 + 9 = 83으로 맞는다.

| ID | name | in_stock | price |
|---|---|---|---:|
| `P-00457` | MobiCore 데일리 무선 이어폰 | false | 199,300 |
| `P-00521` | NeoTech 스마트 무선 이어폰 | false | 151,100 |
| `P-04393` | SoundLab 데일리 무선 이어폰 | false | 185,300 |

- 변화가 없다면 데이터 근거: 해당 없음. 9건이 늘었다.
- 제거한 조건의 역할: `in_stock` filter는 "지금 살 수 있는 것만" 남기는 조건이다. 빼면
  품절 상품이 결과에 섞인다. 늘어난 9건은 이름·카테고리·가격이 모두 조건에 맞아서 화면에서는
  다른 상품과 구별되지 않는데, 실제로는 주문할 수 없는 상품이다. 검색 품질로 보면 74건이
  맞고 83건은 사용자를 헛걸음시키는 결과다. 조건 하나가 빠지면 결과 수만 늘어나는 것이 아니라
  **결과의 의미가 달라진다.**

## (공통) 문제 3 — should 조건 직접 구현

category가 `전자기기`인 문서 중 `name`에 `무선`이 있거나 `in_stock=true`인 조건을 최소 하나 만족하도록 bool API를 작성하세요. `minimum_should_match`를 명시하세요.

### API 전체 입력

```http
GET /products/_search
{
  "size": 10,
  "_source": ["product_id", "name", "in_stock"],
  "query": {
    "bool": {
      "filter": [
        { "term": { "category": "전자기기" } }
      ],
      "should": [
        { "match": { "name": "무선" } },
        { "term": { "in_stock": true } }
      ],
      "minimum_should_match": 1
    }
  }
}
```

### 결과 입력

- `hits.total.value`: 1097
- 무선이지만 품절인 문서 존재 여부: **있다. 32건.** `name`에 "무선"이 있고 `in_stock`이 `false`인
  전자기기를 따로 세어 확인했다. 두 번째 should 조건은 못 맞췄지만 첫 번째를 맞췄으므로
  `minimum_should_match: 1`을 통과한다.
- 무선이 아니지만 재고가 있는 문서 존재 여부: **있다. 848건.** `P-00009` "NeoTech 데일리 기계식
  키보드", `P-00081` "NeoTech 스마트 기계식 키보드"처럼 무선과 상관없는 상품이지만 재고가
  있어서 들어왔다.
- should 조건 판정: **의도대로 동작한다.** 전자기기 1,250건을 네 갈래로 나눠 확인했다.

| 무선 | 재고 | 문서 수 | 결과 포함 |
|---|---|---:|---|
| O | O | 217 | 포함 (should 2개 만족) |
| O | X | 32 | 포함 (should 1개 만족) |
| X | O | 848 | 포함 (should 1개 만족) |
| X | X | 153 | **제외** |

  217 + 32 + 848 = 1,097로 실제 total과 같고, 여기에 제외된 153건을 더하면 전자기기 전체
  1,250건이 된다. 숫자가 남거나 모자라지 않으므로 `should`가 "둘 중 하나 이상"으로 정확히
  작동했다고 말할 수 있다.

  `filter`의 category 조건은 `should`와 무관하게 항상 적용된다. 그래서 전자기기가 아닌 문서는
  아무리 무선이고 재고가 있어도 들어오지 않는다. `minimum_should_match`를 명시하지 않으면
  `filter`가 있는 경우 기본값이 0이 되어 `should`가 순위에만 영향을 주고 결과를 걸러내지
  않는다. 조건으로 쓰려면 반드시 적어야 한다.

## (개인) 문제 4 — 자기 bool 검색

자기 사용자 질문 하나를 검색 의도와 정확 조건으로 분해해 bool 요청을 구현하세요.

### 역할·검증 기준

- must 0~1개, filter 2개 이상을 사용합니다.
- 각 field와 query 선택 이유를 mapping type으로 설명합니다.
- 반환 문서 3개 이상을 실제 값으로 검증합니다.

### API와 결과 입력

```http
GET /flights/_search
{
  "size": 3,
  "_source": ["trip_id", "route_desc", "seat_class", "stay_nights", "total_price"],
  "query": {
    "bool": {
      "must": [
        { "match": { "route_desc": "직항" } }
      ],
      "filter": [
        { "term":  { "seat_class": "economy" } },
        { "range": { "stay_nights": { "lte": 5 } } },
        { "range": { "total_price": { "lte": 600000 } } }
      ]
    }
  },
  "sort": [{ "total_price": "asc" }]
}
```

- 사용자 질문: "짧게 다녀올 수 있는 직항 이코노미를 60만원 안에서 싼 순으로 보고 싶다"

  이 한 문장을 검색 의도와 정확 조건으로 나누면 이렇게 된다.

| 질문 조각 | 어디에 넣었나 | field / type | 이유 |
|---|---|---|---|
| "직항" | `must`의 `match` | `route_desc` / `text` | 문장에서 단어를 찾는다. 얼마나 잘 맞는지가 점수로 나온다 |
| "이코노미" | `filter`의 `term` | `seat_class` / `keyword` | 세 값 중 하나로 정해져 있다. 맞거나 틀리거나다 |
| "짧게" = 5박 이하 | `filter`의 `range` | `stay_nights` / `integer` | 숫자 범위다. 점수로 잴 것이 없다 |
| "60만원 안에서" | `filter`의 `range` | `total_price` / `integer` | 예산 상한이다. 넘으면 아예 보고 싶지 않다 |

- must와 이유: `match route_desc "직항"` 하나만 뒀다. `route_desc`가 `text`라 문장이
  `인천 / 도쿄 / 왕복 / 직항`으로 쪼개져 있어 단어로 찾아야 한다. `is_direct`(boolean)로도
  같은 조건을 걸 수 있지만, 이번에는 사용자가 입력창에 친 단어를 그대로 처리하는 경로를
  확인하려고 전문 검색 쪽을 골랐다.

- filter 2개와 이유: 위 표의 `seat_class`·`stay_nights`·`total_price` 세 개를 넣었다.
  모두 정도가 아니라 통과 여부만 따지면 되는 조건이라 점수를 계산할 이유가 없다.

- 실제 검증 결과: `hits.total.value` **772건**. `_score`는 `sort`를 줘서 `null`로 나온다.

| ID | `route_desc` | `seat_class` | `stay_nights` | `total_price` |
|---|---|---|---:|---:|
| `TRIP-02382` | 인천 도쿄 왕복 직항 | economy | 1 | 300,471 |
| `TRIP-09904` | 인천 방콕 왕복 직항 | economy | 4 | 300,562 |
| `TRIP-01715` | 인천 타이베이 왕복 직항 | economy | 3 | 300,890 |

  세 건 모두 `route_desc`에 "직항"이 있고, economy이며, 5박 이하이고, 60만원 이하다.
  네 조건을 `_source`에서 직접 확인했다. 가격도 300,471 → 300,562 → 300,890으로 오름차순이다.
  노선이 도쿄·방콕·타이베이로 섞여 나오는데 조건에 노선을 넣지 않았으므로 맞는 결과다.

## (개인) 문제 5 — 조건 역할 검증

개인 문제 4에서 filter 하나를 제거하고 전후 결과를 비교하세요. 추가로 원래 조건에서 제외되어야 하는 문서 1개를 독립 요청으로 확인하세요.

### 역할·검증 기준

- 한 번에 filter 하나만 제거합니다.
- 새로 포함된 문서의 실제 값을 확인합니다.
- 제외 문서는 원래 bool 결과에 포함되지 않아야 합니다.

### API와 결과 입력

```http
### (1) seat_class filter만 제거
GET /flights/_search
{
  "size": 3,
  "_source": ["trip_id", "route_desc", "seat_class", "stay_nights", "total_price"],
  "query": {
    "bool": {
      "must": [
        { "match": { "route_desc": "직항" } }
      ],
      "filter": [
        { "range": { "stay_nights": { "lte": 5 } } },
        { "range": { "total_price": { "lte": 600000 } } }
      ]
    }
  },
  "sort": [{ "total_price": "asc" }]
}

### (2) 제외 문서 독립 확인 — 원래 조건에 TRIP-00001만 대조
GET /flights/_search
{
  "size": 1,
  "query": {
    "bool": {
      "must": [
        { "match": { "route_desc": "직항" } }
      ],
      "filter": [
        { "term":  { "seat_class": "economy" } },
        { "range": { "stay_nights": { "lte": 5 } } },
        { "range": { "total_price": { "lte": 600000 } } },
        { "ids":   { "values": ["TRIP-00001"] } }
      ]
    }
  }
}
```

- 제거한 filter: `{ "term": { "seat_class": "economy" } }` 하나만 뺐다. `must`와 나머지 두
  `range`, `sort`는 그대로 뒀다.

- 전/후 total: **772 → 1,124.** 352건 늘었다.

- 새로 포함된 ID와 값: 3위에 `TRIP-09512`가 새로 들어왔다.

| ID | `route_desc` | `seat_class` | `stay_nights` | `total_price` |
|---|---|---|---:|---:|
| `TRIP-09512` | 인천 타이베이 왕복 직항 | **first** | 1 | 300,857 |

  원래 3위였던 `TRIP-01715`(300,890원)는 4위로 밀렸다. 300,857원짜리 퍼스트클래스가 그 앞에
  끼어들었기 때문이다. 늘어난 352건이 어느 등급인지 `terms` 집계로 확인하니
  economy 772 / business 227 / first 125였고, 227 + 125 = **352**로 정확히 맞는다.

  운임이 좌석등급과 무관하게 생성된 데이터라 퍼스트클래스가 30만원대로 나온다. 실제 항공권
  이라면 있을 수 없는 값이고, `docs/data-model.md` 6절에 적어 둔 한계다. 다만 filter를 빼면
  등급이 섞인다는 이번 실험의 결론 자체는 영향을 받지 않는다.

- 제외 확인 ID와 근거: `TRIP-00001`.

  원래 bool 조건에 `ids` filter를 하나 더 걸어 이 문서만 대조했더니 `hits.total.value`가
  **0**이었다. 조건에 걸리지 않는다는 뜻이다. 실제 값을 보면 이유가 분명하다.

| field | 실제 값 | 판정 |
|---|---|---|
| `route_desc` | 인천 도쿄 왕복 **경유** | `must match "직항"` 위반 |
| `seat_class` | **business** | `term economy` 위반 |
| `stay_nights` | 5 | 통과 (`lte: 5`는 5를 포함한다) |
| `total_price` | **924,066** | `lte: 600000` 위반 |

  네 조건 중 세 개를 위반한다. 하나만 위반해도 `bool`의 `must`와 `filter`는 모두 만족해야
  하므로 결과에서 빠진다. `stay_nights`가 5로 통과한 것이 눈에 띄는데, 조건 하나를 통과했다고
  결과에 들어오지는 않는다는 점이 `should`와 다른 부분이다. 공통 문제 3의 `should`는 하나만
  맞아도 들어왔지만, `must`와 `filter`는 전부 맞아야 한다.
