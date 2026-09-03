# 내 인덱스를 검색 앱에 연결하는 순서

이 문서는 학생마다 서로 다른 인덱스·mapping·데이터를 FE·BE 검색 앱 템플릿에 연결하는 실행 정본입니다. FE·BE 코드를 수정하는 실습이 아닙니다.

## 완료 결과

아래 과정을 마치면 브라우저에서 검색어를 입력하고 자신의 인덱스 결과를 확인할 수 있습니다.

```text
브라우저 검색어
  → 고정 BE
  → 내가 작성한 Search API
  → 내 ES 인덱스
  → 검색 결과 카드와 실제 Query DSL
```

## 수정 파일과 순서

학생이 직접 수정하는 파일은 정확히 2개입니다. 반드시 아래 순서대로 수정합니다.

| 순서 | 파일 | 수정 내용 |
|---:|---|---|
| 1 | `config/app.config.json` | 내 인덱스명과 결과 화면에 표시할 field |
| 2 | `config/search-request.json` | 내 인덱스에 실행할 Search API JSON body |

다음 파일은 수정하지 않습니다.

```text
public/
server.mjs
Dockerfile
docker-compose.yml
start.ps1
status.ps1
stop.ps1
```

## 0단계: 배포 자료를 받고 개인 저장소로 복사

### 0-1. 배포 저장소 갱신

자신의 배포 저장소 경로로 이동한 뒤 실행합니다.

```powershell
git pull --ff-only origin main
```

### 0-2. 템플릿 복사

아래 경로는 강의실 예시입니다. 각자 자신의 실제 경로로 바꿉니다.

```powershell
$courseRepo = "C:\es-5days-pbl-course"
$myRepo = "C:\es-5days-pbl-co-study"

Copy-Item `
  -LiteralPath "$courseRepo\search-app-template" `
  -Destination $myRepo `
  -Recurse
```

복사 후 작업 위치는 개인 저장소 안이어야 합니다.

```powershell
cd C:\es-5days-pbl-co-study\search-app-template
```

이미 개인 저장소에 `search-app-template`이 있다면 다시 복사하지 말고 기존 폴더를 사용할지 먼저 확인합니다.

## 1단계: 내 인덱스와 mapping 확인

템플릿이 field를 자동으로 추측하지 않습니다. 먼저 Kibana Dev Tools에서 자신의 실제 인덱스를 확인합니다.

```http
GET /_cat/indices?v

GET /내_인덱스/_count

GET /내_인덱스/_mapping

GET /내_인덱스/_search
{
  "size": 1
}
```

다음을 확인합니다.

- 인덱스명이 정확한가?
- 문서가 1건 이상 적재됐는가?
- 전문 검색할 `text` field는 무엇인가?
- 정확 조건에 사용할 `keyword`, `boolean` field는 무엇인가?
- 범위와 정렬에 사용할 숫자 또는 `date` field는 무엇인가?
- 실제 `_source`에 화면에 보여 줄 값이 들어 있는가?

공통 `products`와 개인 인덱스 이름을 똑같이 만들면 서로 덮어쓰거나 혼동할 수 있습니다. 가능하면 `student01-books`, `student02-travel`처럼 개인 인덱스임을 알 수 있는 고유 이름을 사용합니다.

## 2단계: field 역할표 작성

코드를 바꾸기 전에 자신의 field를 화면 역할과 검색 역할에 연결합니다.

| 역할 | 내 field | 권장 타입 | 필수 여부 |
|---|---|---|---|
| 검색 대상 1 |  | `text` | 필수 |
| 검색 대상 2 |  | `text` | 선택 |
| 카드 제목 |  | 제한 없음 | 필수 |
| 카드 설명 |  | 제한 없음 | 선택 |
| 카드 분류 |  | 주로 `keyword` | 선택 |
| 부가 정보 1 |  | 제한 없음 | 선택 |
| 범위 조건 |  | 숫자 또는 `date` | 선택 |
| 정렬 기준 |  | 숫자·날짜·`keyword` | 선택 |

도서 인덱스 예시:

| 역할 | field |
|---|---|
| 검색 대상 | `title`, `summary` |
| 카드 제목 | `title` |
| 카드 설명 | `summary` |
| 카드 분류 | `subject` |
| 부가 정보 | `author`, `publish_year`, `loan_count` |
| 범위 조건 | `publish_year` |
| 정렬 기준 | `loan_count` |

학생마다 field 이름이 달라도 괜찮습니다. 중요한 것은 자신의 mapping과 정확히 일치시키는 것입니다.

## 3단계: 첫 번째 파일 수정 — `app.config.json`

수정 파일:

```text
search-app-template\config\app.config.json
```

도서 인덱스 예시:

```json
{
  "appTitle": "나의 도서 검색 서비스",
  "appDescription": "제목과 줄거리로 도서를 검색합니다.",
  "index": "student01-books",
  "searchPlaceholder": "책 제목이나 내용을 입력하세요",
  "exampleQueries": ["여행", "과학", "역사"],
  "pageSize": 12,
  "resultFields": {
    "title": "title",
    "description": "summary",
    "badge": "subject",
    "meta": [
      { "label": "저자", "field": "author" },
      { "label": "출판연도", "field": "publish_year", "format": "number", "suffix": "년" },
      { "label": "대출 수", "field": "loan_count", "format": "number" }
    ]
  }
}
```

### 반드시 바꿀 항목

| 설정 | 입력할 값 |
|---|---|
| `appTitle` | 자신의 검색 서비스 이름 |
| `appDescription` | 무엇을 검색하는 서비스인지 설명 |
| `index` | `GET /_cat/indices`에서 확인한 정확한 개인 인덱스명 |
| `searchPlaceholder` | 사용자에게 보여 줄 검색 안내 |
| `exampleQueries` | 실제 데이터에서 결과가 나오는 검색어 2~3개 |
| `resultFields.title` | 카드 제목으로 보여 줄 field |
| `resultFields.description` | 카드 설명으로 보여 줄 field |
| `resultFields.badge` | 분류 표시용 field |
| `resultFields.meta` | 카드 아래에 보여 줄 부가 field |

`description`이나 `badge`가 필요 없다면 해당 줄을 삭제할 수 있습니다. `meta`는 2~4개를 권장합니다.

객체 안의 field는 `author.name`처럼 점 경로로 지정할 수 있습니다. 숫자에 천 단위 구분이 필요하면 `"format": "number"`, 값 뒤에 단위가 필요하면 `"suffix": "원"`처럼 작성합니다.

## 4단계: Dev Tools에서 내 Search API 먼저 완성

앱에 바로 붙이지 말고 Kibana Dev Tools에서 정상 결과를 먼저 확인합니다.

```http
POST /student01-books/_search
{
  "_source": [
    "title",
    "summary",
    "subject",
    "author",
    "publish_year",
    "loan_count"
  ],
  "query": {
    "multi_match": {
      "query": "여행",
      "fields": ["title^3", "summary"]
    }
  },
  "highlight": {
    "fields": {
      "title": {},
      "summary": {}
    }
  },
  "sort": [
    { "_score": "desc" },
    { "loan_count": "desc" }
  ]
}
```

확인 기준:

- HTTP 오류가 없다.
- `hits.total.value`가 예상과 맞는다.
- 상위 문서가 사용자 질문과 관련 있다.
- `_source`에 화면 표시 field가 모두 있다.
- `highlight`와 `sort`가 의도대로 동작한다.

## 5단계: 두 번째 파일 수정 — `search-request.json`

수정 파일:

```text
search-app-template\config\search-request.json
```

Dev Tools 요청에서 아래 경로 줄은 복사하지 않습니다.

```http
POST /student01-books/_search
```

중괄호로 시작하는 JSON body만 복사하고, 고정 검색어를 정확히 `{{searchText}}`로 바꿉니다.

```json
{
  "_source": [
    "title",
    "summary",
    "subject",
    "author",
    "publish_year",
    "loan_count"
  ],
  "query": {
    "multi_match": {
      "query": "{{searchText}}",
      "fields": ["title^3", "summary"]
    }
  },
  "highlight": {
    "pre_tags": ["<mark>"],
    "post_tags": ["</mark>"],
    "fields": {
      "title": {},
      "summary": {}
    }
  },
  "sort": [
    { "_score": "desc" },
    { "loan_count": "desc" }
  ]
}
```

### 작성 규칙

- `GET`, `POST`, URL, `###`, `# 주석`을 넣지 않습니다.
- `{ ... }` JSON body만 저장합니다.
- 사용자 검색어가 들어갈 위치는 `"{{searchText}}"`로 작성합니다.
- `app.config.json`에서 화면에 표시하는 field를 `_source`에 포함합니다.
- 앱이 `app.config.json`의 `pageSize`를 최종 `size`로 적용합니다.
- highlight를 쓰려면 `<mark>`용 `pre_tags`, `post_tags`를 추가합니다.
- ES 비밀번호를 이 파일에 넣지 않습니다.

## 6단계: 범위·filter·정렬 조건 적용

학생마다 field 이름과 타입이 다르므로 앱이 `price`, `rating` 같은 field를 자동으로 추측하지 않습니다. 자신의 Query DSL에 직접 작성합니다.

예를 들어 도서의 출판연도를 제한하고 대출 수가 많은 순으로 정렬한다면 다음과 같이 작성합니다.

```json
{
  "_source": ["title", "summary", "subject", "publish_year", "loan_count", "available"],
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "{{searchText}}",
            "fields": ["title^3", "summary"]
          }
        }
      ],
      "filter": [
        { "term": { "available": true } },
        { "range": { "publish_year": { "gte": 2020, "lte": 2026 } } }
      ]
    }
  },
  "sort": [
    { "_score": "desc" },
    { "loan_count": "desc" }
  ]
}
```

검색창에 `2020년 이후 대출순`이라고 문장으로 입력하면 앱이 조건을 자동 생성하는 것은 아닙니다. 현재 검색창은 키워드만 받습니다. `range`, `term`, `sort`는 학생이 `search-request.json`에 작성하며 화면의 `검색 쿼리 보기`에서 최종 요청을 확인합니다.

## 7단계: 로컬 FE·BE 실행

Docker Desktop과 Day 1 ES가 먼저 실행 중이어야 합니다.

```powershell
cd C:\es-5days-pbl-co-study\search-app-template
./start.ps1
```

개인 저장소에서 처음 실행하면 Day 1 ES의 `elastic` 비밀번호를 한 번 묻습니다. 입력 문자는 화면에 나타나지 않습니다. 스크립트가 Git 제외 대상 `.env`를 자동 생성하므로 학생이 `.env`를 직접 수정하지 않습니다.

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:3000
```

상태 확인:

```powershell
./status.ps1
```

종료:

```powershell
./stop.ps1
```

## 8단계: 변경 사항 반영

- `search-request.json` 수정: 저장 후 다시 검색합니다.
- `app.config.json` 수정: 저장 후 브라우저를 새로고침합니다.
- 위 두 설정 파일은 컨테이너를 재시작하거나 재빌드하지 않아도 됩니다.
- `public/`이나 `server.mjs`를 수정한 경우에만 `start.ps1`로 재빌드합니다. 기본 수업에서는 코드 파일을 수정하지 않습니다.

## 9단계: 브라우저 기능 테스트

### 테스트 1 — 대표 검색어

실제 데이터에서 결과가 있는 검색어를 입력합니다. 제목·설명·분류·부가정보가 자신의 field에서 나오는지 확인합니다.

### 테스트 2 — 다른 검색어

첫 검색어와 의미가 다른 단어를 입력합니다. 결과와 상위 순위가 달라지는지 확인합니다.

### 테스트 3 — 0건

`존재하지않는검색어9999`처럼 데이터에 없는 값을 입력합니다. 오류가 아니라 `검색 결과가 없습니다`가 표시되어야 합니다.

### 테스트 4 — highlight

검색된 단어가 제목 또는 설명에 노란색으로 표시되는지 확인합니다. 표시되지 않으면 `highlight.fields`와 실제 검색 field를 비교합니다.

### 테스트 5 — filter 반례

filter 조건을 만족하는 문서와 만족하지 않는 문서를 Dev Tools에서 먼저 찾습니다. 검색어가 같아도 조건에 맞지 않는 문서가 제외되는지 확인합니다.

### 테스트 6 — 정렬

상위 결과 3개의 정렬 field 값을 확인합니다. `desc`이면 값이 큰 순서, `asc`이면 작은 순서인지 확인합니다.

### 테스트 7 — 실제 Query DSL

검색 결과 위의 `검색 쿼리 보기`를 누릅니다.

- 경로가 `POST /내_인덱스/_search`인가?
- `{{searchText}}`가 실제 검색어로 바뀌었는가?
- `filter`, `range`, `sort`, `highlight`가 작성한 대로 보이는가?
- JSON이 들여쓰기되어 있는가?
- 비밀번호나 인증정보가 표시되지 않는가?

확인 후 `검색 쿼리 닫기`를 눌러 패널을 닫습니다.

## 10단계: 오류를 위치별로 진단

### 앱 화면이 열리지 않음

```powershell
./status.ps1
docker compose logs --tail 100 search-app
```

### Search API도 실패함

인덱스명, ES 비밀번호, Query DSL JSON 문법, mapping 타입을 확인합니다.

### Dev Tools는 성공하지만 앱 검색은 실패함

`search-request.json`에서 `POST /인덱스/_search` 줄과 주석을 제거했는지 확인합니다. JSON body만 있어야 합니다.

### 검색 결과가 0건임

실제 저장값, 검색 field, `text`/`keyword` 타입, `{{searchText}}` 위치를 확인합니다.

### 검색은 되지만 카드에 `-`가 표시됨

`app.config.json`의 `resultFields`, `search-request.json`의 `_source`, 실제 문서의 field 이름을 함께 비교합니다.

### 모든 검색어에서 같은 결과가 나옴

`search-request.json`의 실제 검색어 위치가 `{{searchText}}`로 바뀌었는지 확인합니다.

### 정렬 오류가 발생함

정렬 field가 실제 mapping에 존재하는지, 숫자·날짜·`keyword`처럼 정렬 가능한 타입인지 확인합니다.

## 11단계: 완료 확인표

- [ ] 배포 저장소가 최신 상태다.
- [ ] 템플릿을 개인 PBL 저장소에 복사했다.
- [ ] 내 인덱스명과 문서 수를 확인했다.
- [ ] mapping을 보고 field 역할표를 작성했다.
- [ ] `config/app.config.json`을 내 field로 수정했다.
- [ ] Dev Tools에서 내 Search API가 먼저 성공했다.
- [ ] `config/search-request.json`에 JSON body만 넣었다.
- [ ] 검색어 위치를 `{{searchText}}`로 바꿨다.
- [ ] 화면 표시 field를 `_source`에 포함했다.
- [ ] 대표 검색·다른 검색·0건을 확인했다.
- [ ] highlight·filter·정렬 중 자신이 사용한 기능을 검증했다.
- [ ] `검색 쿼리 보기`에서 최종 Query DSL을 확인했다.
- [ ] `.env`가 Git에 포함되지 않았다.

## 최종 제출 대상

개인 PBL 저장소에는 다음을 포함합니다.

```text
search-app-template/config/app.config.json
search-app-template/config/search-request.json
```

템플릿 전체를 함께 제출할 수 있지만 실제 `.env`는 제출하거나 GitHub에 올리지 않습니다. 평가는 화면 디자인보다 자신의 mapping·Query DSL·검색 결과를 연결하고 설명할 수 있는지를 기준으로 합니다.
