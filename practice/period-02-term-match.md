# 2교시 실습 — term과 match

공통 문제 1~3은 강사님 배포 데이터인 `products` index로, 개인 문제 4~5는 내 PBL index인
`flights`로 실행했다. 실행 시각은 2026-09-02 11:40~11:55 KST, Elasticsearch 9.5.0이다.

## (공통) 문제 1 — 제공 코드로 정확 조건 확인

```http
GET /products/_search
{
  "size": 5,
  "query": { "term": { "category": "전자기기" } }
}
```

### 결과 입력

- `hits.total.value`: 1250
- 상위 3개 문서 ID: `P-00009`, `P-00025`, `P-00081`
- 상위 3개 문서의 category: 세 건 모두 `전자기기` (이름은 "NeoTech 데일리 기계식 키보드",
  "MobiCore 컴팩트 무선 이어폰", "NeoTech 스마트 기계식 키보드")
- 모든 확인 문서가 정확 조건을 만족하는가: 만족한다. 반환된 5건의 `category`가 전부
  `전자기기`였다. 건수도 `generation-summary.json`의 카테고리별 1,250건과 같으므로 빠뜨린
  문서 없이 정확히 그 집합만 걸렸다고 볼 수 있다.
- `term`을 선택한 mapping 근거: `product-mapping.json`에서 `category`는 `keyword`다. `keyword`는
  색인할 때 분석하지 않고 값 전체를 하나의 token으로 저장한다. "전자기기"라는 값이 통째로
  들어 있으므로 값 전체를 그대로 비교하는 `term`이 맞다. 카테고리는 "전자"와 "기기"로 쪼개서
  찾을 이유가 없고, 쪼개면 오히려 다른 카테고리까지 걸릴 수 있다.

## (공통) 문제 2 — text 전문 검색 직접 구현

`products` index에서 상품명 `name`에 `무선`이라는 검색 의도가 있는 문서를 찾으세요. text 전문 검색에 적합한 query를 선택해 최대 5건을 반환하세요.

### API 전체 입력

```http
GET /products/_search
{
  "size": 5,
  "_source": ["product_id", "name"],
  "query": { "match": { "name": "무선" } }
}
```

### 결과 입력

- 선택한 query와 이유: `match`. `name`은 mapping에서 `text`이고 `korean_search` analyzer가
  붙어 있다. `text`는 색인할 때 문장을 token으로 쪼개 저장하므로, 검색어도 같은 analyzer로
  쪼개서 비교해야 한다. `match`가 그 일을 한다. 사용자는 "무선"이라는 단어 하나를 입력하지
  상품명 전체를 입력하지 않으므로 전문 검색이 맞다.
- `hits.total.value`: 505
- 상위 3개 ID·name: `P-00025` "MobiCore 컴팩트 무선 이어폰" / `P-00042` "CleanMate 실속형 무선 청소기" /
  `P-00129` "Auralis 스마트 무선 이어폰" (셋 다 `_score` 3.0212545로 같다)

이어폰만 나오는 것이 아니라 청소기도 걸린다. "무선"이라는 단어만 조건이므로 당연한 결과다.
이어폰만 원했다면 검색어를 늘리거나 조건을 더 걸어야 한다.

## (공통) 문제 3 — 부적절한 조합 비교

같은 `name` field와 `무선` 검색어에 `term` query를 사용한 API를 직접 작성하세요. 문제 2와 결과를 비교하고, 차이를 mapping 또는 분석된 token 관점에서 설명하세요.

### API 전체 입력

```http
GET /products/_search
{
  "size": 5,
  "_source": ["product_id", "name"],
  "query": { "term": { "name": "무선" } }
}
```

### 비교 결과

- 문제 2 total / 문제 3 total: **505 / 505**. 같다.
- 공통으로 나온 문서 ID: 상위 5건이 `P-00025`, `P-00042`, `P-00129`, `P-00153`, `P-00209`로
  순서까지 완전히 같았다. `_score`도 3.0212545로 동일하다.
- 달라진 이유: 이번에는 **달라지지 않았다.** `POST /products/_analyze`로 `name` field에
  "SoundLab 실속형 무선 이어폰"을 넣어 보니 `soundlab / 실속형 / 무선 / 이어폰` 네 token으로
  저장된다. 즉 index 안에 "무선"이라는 token이 그대로 들어 있다. `term`은 검색어를 분석하지
  않고 그대로 비교하는데, 마침 검색어 "무선"이 저장된 token과 글자까지 일치했다.
  `match`도 "무선"을 분석해 봐야 token이 "무선" 하나라서 결국 같은 것을 찾게 된다.
  검색어가 한 token이고 분석 결과가 원문과 같을 때는 두 query가 같은 결과를 낸다.
- `term`은 text에서 항상 0건인가? 실제 근거: **아니다.** 위처럼 505건이 나왔다.
  다만 조금만 어긋나도 바로 0건이 된다. 세 가지를 더 실행해 확인했다.

| 요청 | total | 이유 |
|---|---:|---|
| `term name "무선"` | 505 | 저장된 token "무선"과 글자가 같다 |
| `term name "무선 이어폰"` | 0 | 저장된 token은 "무선"과 "이어폰"으로 나뉘어 있다. "무선 이어폰"이라는 token은 없다 |
| `term name "SoundLab"` | 0 | analyzer가 소문자로 바꿔 `soundlab`으로 저장했다. 대문자가 섞인 원문 그대로는 없다 |
| `term name "soundlab"` | 247 | 저장된 token과 글자가 같다 |
| `match name "SoundLab"` | 247 | `match`는 검색어도 분석해 `soundlab`으로 바꾼 뒤 비교한다 |

정리하면 `term`이 text에서 0건이 되는 이유는 "text라서"가 아니라 **검색어가 저장된 token과
글자 단위로 다르기 때문**이다. 한글 한 단어처럼 분석 전후가 같은 값은 우연히 맞아떨어진다.
그래서 `term`이 text에서 맞았다고 해서 옳은 query 선택인 것은 아니다. 대소문자나 띄어쓰기가
조금만 달라져도 소리 없이 0건이 되므로, text에는 `match`를 쓰는 것이 맞다.

## (개인) 문제 4 — 자기 정확 조건 검색

자기 mapping에서 값 전체가 정확히 일치해야 하는 `keyword` 또는 `boolean` field 하나를 선택해 정확 조건 검색을 구현하세요.

### 역할·검증 기준

- 실제 존재하는 field와 값을 사용합니다.
- 반환 문서의 `_source`에서 조건을 직접 확인합니다.
- 왜 전문 검색이 아니라 정확 비교인지 설명합니다.

### API와 결과 입력

```http
GET /flights/_search
{
  "size": 3,
  "_source": ["trip_id", "arr_airport", "route_desc", "is_direct"],
  "query": { "term": { "arr_airport": "NRT" } }
}
```

- field / type / 값: `arr_airport` / `keyword` / `NRT` (도쿄 나리타 공항 코드)
- 사용자 질문: 도쿄행 항공권만 보고 싶다
- 상위 3개 ID와 실제 값:

| ID | `arr_airport` | `route_desc` | `is_direct` |
|---|---|---|---|
| `TRIP-00001` | NRT | 인천 도쿄 왕복 경유 | false |
| `TRIP-00002` | NRT | 인천 도쿄 왕복 직항 | true |
| `TRIP-00006` | NRT | 인천 도쿄 왕복 직항 | true |

- 통과/실패와 근거: **통과.** `hits.total.value`가 1,690건이고 반환된 3건의 `arr_airport`가
  모두 `NRT`다. Day 2에 기록한 노선 분포(NRT 1,690건)와도 일치하므로 도쿄 노선 전체가
  정확히 걸렸다. 직항과 경유가 섞여 나오는데 이것도 맞다. 조건에 넣은 것은 도착 공항뿐이다.

  왜 전문 검색이 아니라 정확 비교인가: 공항 코드는 세 글자가 통째로 하나의 의미다. 쪼개면
  "N", "R", "T"가 되어 아무 뜻이 없고, 부분 일치도 필요 없다. 사용자가 "NR"까지만 입력해서
  도쿄를 찾는 상황은 없다. `docs/data-model.md`에서 이 field를 `keyword`로 잡은 이유가 그것이다.
  값이 후보 6개 중 하나로 정해져 있어 오타가 아니면 정확히 일치한다.

## (개인) 문제 5 — 자기 전문 검색

자기 mapping의 `text` field 하나와 사용자가 입력할 검색어를 정해 전문 검색 API를 구현하세요.

### 역할·검증 기준

- field가 실제 `text`인지 mapping으로 확인합니다.
- 상위 3개 결과를 관련/보류/무관으로 판정합니다.
- 정확 조건 문제와 query 선택 이유가 달라야 합니다.

### API와 결과 입력

```http
GET /flights/_search
{
  "size": 3,
  "_source": ["trip_id", "route_desc", "arr_airport", "airline"],
  "query": { "match": { "route_desc": "싱가포르 직항" } }
}
```

- field / type / 검색어: `route_desc` / `text` / "싱가포르 직항"

  `elasticsearch/index-create.json`에서 `route_desc`는 `{ "type": "text" }`다. 문제 4의
  `arr_airport`(`keyword`)와 다르다. `GET /flights/_analyze`로 확인하면 "인천 싱가포르 왕복 직항"이
  `인천 / 싱가포르 / 왕복 / 직항` 네 token으로 쪼개진다. 사용자는 이 문장을 통째로 입력하지
  않고 "싱가포르 직항"처럼 단어 몇 개만 던지므로 `match`가 맞다. 문제 4는 값이 정해져 있어
  통째로 비교했지만, 여기는 문장에서 단어를 찾는 것이라 query 선택 이유가 반대다.

- 상위 3개 ID: `TRIP-00003`, `TRIP-00004`, `TRIP-00007` (셋 다 `_score` 2.1374938)

- 관련/보류/무관과 이유:

| ID | `route_desc` | 항공사 | 판정 |
|---|---|---|---|
| `TRIP-00003` | 인천 싱가포르 왕복 직항 | 대한항공 | **관련**. 두 단어를 모두 포함한다 |
| `TRIP-00004` | 인천 싱가포르 왕복 직항 | 티웨이항공 | **관련**. 위와 같다 |
| `TRIP-00007` | 인천 싱가포르 왕복 직항 | 진에어 | **관련**. 위와 같다 |

  상위 3건은 모두 관련이다. 그런데 `hits.total.value`가 **7,451건**으로 지나치게 많다.
  `arr_airport = SIN`인 문서는 1,691건뿐이므로 나머지는 싱가포르와 무관한 문서다.
  `match`의 기본 `operator`가 `or`라 "싱가포르"와 "직항" 중 하나만 걸려도 결과에 들어온다.
  1,691(SIN) + 6,974(직항) − 1,214(둘 다) = 7,451로 실제 total과 맞아떨어진다.

- 완료 판정: **보류.** 상위 3건은 문제가 없지만 결과 집합이 사용자가 원한 것의 6배다.
  `operator`를 `and`로 바꿔 실행하니 1,214건이 되고, 이 값은 `bool.filter`로 만든 정답 집합
  (`arr_airport = SIN` AND `is_direct = true`)의 1,214건과 정확히 같았다. 상위 3건만 보고
  통과로 적었으면 놓쳤을 문제다. `hits.total.value`를 함께 봐야 판정할 수 있다.
  같은 현상을 `evidence/day-03-search.md`의 Q01("도쿄 직항")에서도 확인했고, 그쪽에 원인 진단과
  개선 결과를 정리했다.
