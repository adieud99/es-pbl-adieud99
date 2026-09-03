# 내 인덱스 연결 기록 — flights

`APPLY_MY_INDEX_GUIDE.md`대로 `flights` 인덱스를 검색 앱에 붙인 기록이다.
수정한 파일은 `config/app.config.json`, `config/search-request.json` 두 개뿐이다.

## 1단계 — 인덱스 확인

```http
GET /flights/_count      → 10,000
GET /flights/_mapping
```

| field | type | 비고 |
|---|---|---|
| `trip_id` | keyword | 문서 식별자 |
| `route_desc` | text | `인천 도쿄 왕복 직항` 형태 |
| `airline` | text + `.keyword` | 5개 항공사 |
| `arr_airport` / `dep_airport` | keyword | 도착지 6종 / 출발지 ICN 단일값 |
| `seat_class` | keyword | economy·business·first |
| `total_price` | integer | 300,029 ~ 1,199,769 |
| `stay_nights` | integer | 1 ~ 10 |
| `is_direct` | boolean | true 6,974 / false 3,026 |
| `out_dep_time` | date | 2026-08-31 ~ 2026-10-04 |
| `tags` | keyword | 수하물포함·특가·변경가능 등 |

한 문서는 **판매 중인 왕복 항공권 상품 1건**이다.

## 2단계 — field 역할표

| 역할 | 내 field | 타입 | 고른 이유 |
|---|---|---|---|
| 검색 대상 1 | `route_desc` | text | 사용자가 "도쿄", "직항"처럼 노선을 검색한다. 문장이 단어로 쪼개져 있어야 맞는다 |
| 검색 대상 2 | `airline` | text | 항공사 이름으로도 찾는다 |
| 카드 제목 | `route_desc` | text | 상품을 한 줄로 설명하는 값 |
| 카드 설명 | `airline` | text | 어느 항공사인지가 두 번째로 중요하다 |
| 카드 분류 | `seat_class` | keyword | 좌석등급이 상품 성격을 가른다 |
| 부가 정보 | `total_price`, `stay_nights`, `arr_airport`, `out_dep_time` | integer·keyword·date | 가격·기간·도착지·출발일 |
| 범위 조건 | `total_price` | integer | 예산 상한을 건다 |
| 정렬 기준 | `total_price` | integer | 같은 점수면 싼 것부터 |

`route_desc`에 `^3` 부스트를 준 것은 노선이 항공사보다 검색 의도에 가깝기 때문이다.
"도쿄"를 친 사람은 도쿄행을 찾는 것이지 도쿄라는 항공사를 찾는 게 아니다.

## 4단계 — Dev Tools 선검증

앱에 붙이기 전에 ES에서 먼저 돌렸다.

```http
POST /flights/_search
{
  "_source": ["trip_id","route_desc","airline","seat_class","arr_airport",
              "total_price","stay_nights","out_dep_time"],
  "size": 3,
  "query": {
    "bool": {
      "must": [
        { "multi_match": { "query": "도쿄 직항", "fields": ["route_desc^3","airline"] } }
      ],
      "filter": [ { "range": { "total_price": { "lte": 900000 } } } ]
    }
  },
  "highlight": {
    "pre_tags": ["<mark>"], "post_tags": ["</mark>"],
    "fields": { "route_desc": {}, "airline": {} }
  },
  "sort": [ { "_score": "desc" }, { "total_price": "asc" } ]
}
```

`hits.total.value` **4,972건**. 상위 3건이 전부 score 6.414로 같아서 2차 정렬인
가격 오름차순이 순서를 정했다.

| trip_id | score | total_price | seat_class | airline | route_desc |
|---|---:|---:|---|---|---|
| `TRIP-02382` | 6.414 | 300,471 | economy | 아시아나항공 | 인천 도쿄 왕복 직항 |
| `TRIP-07275` | 6.414 | 301,046 | economy | 대한항공 | 인천 도쿄 왕복 직항 |
| `TRIP-00422` | 6.414 | 301,226 | economy | 아시아나항공 | 인천 도쿄 왕복 직항 |

highlight도 `인천 <mark>도쿄</mark> 왕복 <mark>직항</mark>`로 두 단어 모두 잡혔다.

## 5~6단계 — 설정 파일 작성

`search-request.json`에는 JSON body만 넣었다. `POST /flights/_search` 줄과 주석은
제외했고, 검색어 자리를 `{{searchText}}`로 바꿨다.

작성 후 규칙을 하나씩 확인했다.

| 확인 | 결과 |
|---|---|
| `{{searchText}}` 존재 | O |
| `GET`/`POST`/`###`/주석 없음 | O |
| 화면 표시 field가 `_source`에 전부 포함 | O (8개) |
| highlight field가 검색 field와 일치 | O (`route_desc`, `airline`) |
| 비밀번호·인증정보 없음 | O |

## 9단계 — 검색 테스트

`search-request.json`의 `{{searchText}}`를 실제 값으로 바꿔 ES에 직접 던져 확인했다.

| 검색어 | 결과 | 1위 |
|---|---:|---|
| `도쿄 직항` | 4,972건 | 인천 도쿄 왕복 직항 |
| `대한항공` | 1,279건 | 인천 홍콩 왕복 직항 |
| `존재하지않는검색어9999` | **0건** | 결과 없음(정상) |

`대한항공`이 1,917건이 아니라 1,279건인 이유는 `total_price ≤ 900,000` filter 때문이다.
1,917 × 약 0.67 ≈ 1,285로 대략 맞는다. filter가 실제로 걸리고 있다는 뜻이다.

위 세 건은 ES에 직접 던져 확인한 결과다. 앱을 실제로 띄워 브라우저에서 검색이 동작하는
것도 확인했다.

## 11단계 — 완료 확인표

- [x] 배포 저장소가 최신 상태다.
- [x] 템플릿을 개인 PBL 저장소에 복사했다.
- [x] 내 인덱스명과 문서 수를 확인했다. (`flights` 10,000)
- [x] mapping을 보고 field 역할표를 작성했다.
- [x] `config/app.config.json`을 내 field로 수정했다.
- [x] Dev Tools에서 내 Search API가 먼저 성공했다.
- [x] `config/search-request.json`에 JSON body만 넣었다.
- [x] 검색어 위치를 `{{searchText}}`로 바꿨다.
- [x] 화면 표시 field를 `_source`에 포함했다.
- [x] 대표 검색·다른 검색·0건을 확인했다.
- [x] highlight·filter·정렬을 검증했다.
- [ ] `검색 쿼리 보기`에서 최종 Query DSL을 확인했다. — 앱 실행은 확인, 이 항목은 미점검
- [x] `.env`가 Git에 포함되지 않았다. (`.gitignore`에 등록)

## 지금 설정의 한계

`total_price ≤ 900,000` filter를 고정으로 걸어뒀다. 사용자가 검색창에서 바꿀 수 없다.
현재 검색창은 키워드만 받고 `range`·`term`·`sort`는 `search-request.json`에 적은 대로
고정된다. 예산을 조절하게 하려면 앱 쪽 수정이 필요한데, 이번 실습 범위가 아니다.

`dep_airport`가 ICN 단일값이라 출발지로는 검색을 좁힐 수 없다. 국내 출발만 있는
데이터라 그렇다.
