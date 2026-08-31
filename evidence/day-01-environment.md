# Day 1 환경 확인 기록

- 확인 일시: 2026-08-31 14:30
- Docker 상태: Elasticsearch 3개 node(es01, es02, es03)와 Kibana 컨테이너가 실행 중
- Kibana 접속: `http://localhost:5601` 접속 성공, 전체 상태 `available`
- `GET /` 확인: version number가 `9.5.0`
- `GET /_cluster/health` 확인: status가 `green`, `number_of_nodes`가 3
- `GET /_cat/nodes?v` 확인: node가 3개 표시됨

> 비밀번호, `.env` 실제 값, 토큰은 기록하지 않는다.

---

## 실행 환경 참고

강사 배포 저장소의 실행 스크립트는 PowerShell(`.ps1`) 기준이며 macOS에서는 직접 실행할 수 없다. 각 스크립트가 내부에서 호출하는 Docker 명령을 그대로 사용해 동일한 절차를 수행했다. `docker-compose.yml`과 `.env.example`은 수정하지 않았다.

| 교재 스크립트 | 실제 실행한 명령 |
|---|---|
| `preflight.ps1` | `docker info`, `lsof -i :9200 -i :5601` |
| `pull-images.ps1` | `docker compose pull` |
| `start.ps1` | `docker compose up -d` |
| `status.ps1` | `docker compose ps --all`, `_cluster/health`, `_cat/nodes`, `GET /` |

## 실행 결과

### `GET /_cluster/health`

통과 기준: `status`가 `green`이고 `number_of_nodes`가 3이다.

    {
      "cluster_name" : "es-5days-pbl",
      "status" : "green",
      "number_of_nodes" : 3,
      "number_of_data_nodes" : 3,
      "active_primary_shards" : 2,
      "active_shards" : 4,
      "unassigned_shards" : 0,
      "active_shards_percent_as_number" : 100.0
    }

판정: 통과. 미할당 shard가 0개로 모든 shard가 정상 배치되었다. 사용자 index를 아직 만들지 않았으므로 `active_shards`는 시스템 index의 shard만 집계된 값이다.

### `GET /_cat/nodes?v`

통과 기준: es01, es02, es03이 모두 보이고 master가 하나 선출되어 있다.

    ip         heap.percent ram.percent node.role   master name
    172.21.0.4           60         100 cdfhilmrstw *      es02
    172.21.0.3           62         100 cdfhilmrstw -      es01
    172.21.0.5           54          98 cdfhilmrstw -      es03

판정: 통과. es02가 master로 선출되었다. master는 클러스터가 기동될 때마다 새로 선출되므로 특정 노드로 고정되지 않는다.

### `GET /`

통과 기준: `version.number`가 `9.5.0`이다.

    {
      "name" : "es01",
      "cluster_name" : "es-5days-pbl",
      "version" : {
        "number" : "9.5.0",
        "build_flavor" : "default",
        "build_type" : "docker",
        "lucene_version" : "10.5.0"
      },
      "tagline" : "You Know, for Search"
    }

판정: 통과. 교재가 지정한 버전과 클러스터 이름이 일치한다.

## 확인한 내용

- node가 셋이므로 primary shard와 replica shard가 서로 다른 node에 배치될 수 있고, 그래서 status가 `yellow`가 아닌 `green`이 되었다.
- 클러스터는 TLS가 켜진 상태로 동작하며 CA 인증서와 `elastic` 계정 인증이 모두 필요하다. 인증 없이 접근하면 `missing authentication credentials`가 반환된다.
- `elastic` 계정의 비밀번호는 클러스터가 처음 기동될 때 데이터 volume에 저장된다. 이후 설정 파일의 값을 바꿔도 이미 만들어진 클러스터에는 반영되지 않는다.
- `setup` 컨테이너는 인증서를 생성한 뒤 `Exited (0)`으로 종료된다. 실패가 아니라 한 번만 수행되는 초기화가 정상적으로 끝났다는 뜻이다.
- 외부로 노출된 포트는 es01의 9200과 kibana의 5601뿐이며 둘 다 `127.0.0.1`에 바인딩되어 있다.

## 겪은 문제와 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| `docker compose pull` 실행 시 모든 변수가 빈 값으로 읽히고 `mem_limit invalid size: ''` 발생 | 환경 설정 파일이 없었음. 편집기에서 작성한 내용이 저장되지 않아 0바이트 파일만 존재했고 파일명도 달랐음 | 터미널에서 예제 파일을 복사해 다시 만들고 비밀번호 두 줄만 수정 |
| 설정 파일의 비밀번호를 수정한 뒤 모든 요청이 401 `unable to authenticate user [elastic]`로 실패 | 비밀번호는 클러스터 최초 기동 시점에 데이터 volume에 반영되므로 설정 파일만 수정해서는 적용되지 않음 | `docker compose down --volumes --remove-orphans`로 데이터·인증서 volume까지 삭제한 뒤 재기동. `cluster_uuid`가 바뀐 것으로 클러스터가 새로 생성되었음을 확인 |
| PowerShell 스크립트가 실행되지 않음 | macOS에서는 `.ps1` 실행 불가 | 스크립트 내부의 Docker 명령을 직접 실행 (위 대응표 참고) |