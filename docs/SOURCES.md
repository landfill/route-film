# Sources & licenses

조사일: 2026-10-23(KST). 아래 세 참고 저장소는 HTTPS Git으로 직접 읽고 고정 커밋의 README, 라이선스, 실행 설정, 관련 소스를 검토했다. 참고 프로젝트의 코드·이미지·음악·3D 모델은 이 제품에 복사하지 않았다.

## 참고 구현

| 프로젝트 | 검토한 커밋 | 확인한 구현·조건 | Route Film의 선택 |
|---|---|---|---|
| [Makio64/threejs-cinematic-world-zoom](https://github.com/Makio64/threejs-cinematic-world-zoom/tree/a15c683fb30671a44115c30e6ef045938c5a4167) | `a15c683fb30671a44115c30e6ef045938c5a4167` | MIT 소스. Node ≥22.12, pnpm, WebGL2. 실제 지구는 Cesium Ion/Google 3D Tiles 키와 별도 타일 이용약관에 의존. README는 녹화에 하드웨어 WebCodecs 인코더가 필요하다고 명시. | 샷별 목적, 카메라 채널별 곡선, 가상 시계의 프레임 고정이라는 기법만 참고. 타일·대기 바이너리·카메라 소스는 사용하지 않음. |
| [marceloprates/prettymaps](https://github.com/marceloprates/prettymaps/tree/02f85870ced807b7d24ce1764764ff877f9edffd) | `02f85870ced807b7d24ce1764764ff877f9edffd` | LICENSE는 AGPLv3, `fetch.py` 헤더는 AGPLv3-or-later. `setup.py`의 MIT 표기와 불일치하므로 MIT로 간주하지 않음. 실제 `python_requires`는 ≥3.12이며 README 배지의 3.11+와도 차이. OSMnx/Shapely/Matplotlib/rasterio 등으로 데이터를 기하·스타일 레이어로 분리. | 원본 코드를 포함하거나 라이브러리를 의존성으로 설치하지 않음. 데이터/기하/표현 분리와 인쇄 레이아웃만 일반적 설계 아이디어로 참고. OSM 데이터도 사용하지 않음. |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes/tree/cfff4493dfc6ec2edb6f88295009fd89eebfd6c5) | `cfff4493dfc6ec2edb6f88295009fd89eebfd6c5` | Apache-2.0. CLI 기본 요구사항 Node ≥22와 FFmpeg; 개발 모노레포는 Bun 1.4.4 지정. producer의 parity harness가 시간을 프레임으로 양자화하고 플레이어 seek 후 브라우저 프레임을 캡처. | 벽시계 대신 `frame / fps`로 장면을 계산하는 구조를 독립 구현. 전체 프레임워크나 제공 템플릿·에셋은 사용하지 않음. |

직접 확인한 주요 파일:

- Cinematic Zoom: [README](https://github.com/Makio64/threejs-cinematic-world-zoom/blob/a15c683fb30671a44115c30e6ef045938c5a4167/README.md), [Recorder.js](https://github.com/Makio64/threejs-cinematic-world-zoom/blob/a15c683fb30671a44115c30e6ef045938c5a4167/src/record/Recorder.js), [package.json](https://github.com/Makio64/threejs-cinematic-world-zoom/blob/a15c683fb30671a44115c30e6ef045938c5a4167/package.json), [LICENSE](https://github.com/Makio64/threejs-cinematic-world-zoom/blob/a15c683fb30671a44115c30e6ef045938c5a4167/LICENSE).
- Prettymaps: [fetch.py](https://github.com/marceloprates/prettymaps/blob/02f85870ced807b7d24ce1764764ff877f9edffd/prettymaps/fetch.py), [draw.py](https://github.com/marceloprates/prettymaps/blob/02f85870ced807b7d24ce1764764ff877f9edffd/prettymaps/draw.py), [setup.py](https://github.com/marceloprates/prettymaps/blob/02f85870ced807b7d24ce1764764ff877f9edffd/setup.py), [LICENSE](https://github.com/marceloprates/prettymaps/blob/02f85870ced807b7d24ce1764764ff877f9edffd/LICENSE).
- HyperFrames: [README](https://github.com/heygen-com/hyperframes/blob/cfff4493dfc6ec2edb6f88295009fd89eebfd6c5/README.md), [parity-harness.ts](https://github.com/heygen-com/hyperframes/blob/cfff4493dfc6ec2edb6f88295009fd89eebfd6c5/packages/producer/src/parity-harness.ts), [package.json](https://github.com/heygen-com/hyperframes/blob/cfff4493dfc6ec2edb6f88295009fd89eebfd6c5/package.json), [LICENSE](https://github.com/heygen-com/hyperframes/blob/cfff4493dfc6ec2edb6f88295009fd89eebfd6c5/LICENSE).

AGPL 코드를 수정·결합해 네트워크 서비스를 제공한다면 해당 라이선스의 소스 제공 의무 등을 별도로 검토해야 한다. 이 프로젝트는 위 AGPL 소스를 포함하지 않는다. Google 타일 이미지도 사용하지 않으므로 그 자료의 사용 권리를 가진 것처럼 주장하지 않는다.

## 장소·좌표

표현 좌표는 WGS84 위도/경도이며 장소의 대표 지점을 가리킨다. 출입구, 철도 승강장, 여행자의 실제 이동 궤적을 보장하지 않는다. 샘플의 창작 시각·메모와 구분해 사용한다.

일본 역의 개별 사실값은 [piuccio/open-data-jp-railway-stations](https://github.com/piuccio/open-data-jp-railway-stations/blob/104ea01f5aad242c931e756ec4c216abce3ff7df/stations.json) (`104ea01f5aad242c931e756ec4c216abce3ff7df`)에서 확인했다. README는 ekidata와 Association for Open Data of Public Transportation의 정보를 통합했다고 밝힌다. 저장소에 포괄적 데이터 라이선스가 없으므로 전체 DB·코드·목록을 재배포하지 않고 아래 소수의 장소명·좌표 사실만 출처와 함께 기록한다.

| 장소 | 위도 | 경도 | 비고 |
|---|---:|---:|---|
| Kyoto Station / 京都駅 | 34.985465 | 135.757748 | JR 대표 지점. 같은 장소의 출발/귀환에 같은 좌표 사용 가능 |
| Fukuchiyama Station / 福知山駅 | 35.296143 | 135.118564 | JR 대표 지점. Tango 노선의 별도 지점과 구분 |
| Miyazu Station / 宮津駅 | 35.534410 | 135.199875 | 바닷가 마을로 접근하는 역 |
| Amanohashidate Station / 天橋立駅 | 35.557729 | 135.182456 | 역 위치이며 모래톱의 위치로 오인하지 않도록 구분 |

서울의 개별 장소 사실은 [fergalpowell/seoul-attractions locations.csv](https://github.com/fergalpowell/seoul-attractions/blob/4d990397dd8fea3d59f4f3f3a15abb5aee96706a/attractions/locations.csv) (`4d990397dd8fea3d59f4f3f3a15abb5aee96706a`)에서 확인했다. 이 저장소도 데이터 라이선스와 측량 정확도를 명시하지 않는다. 전체 자료나 프로그램을 가져오지 않았으며 아래 대표 지점은 여행 편집기에서 수정 가능한 대략적 위치로 취급한다. 다른 행에는 오래되거나 부정확한 정보가 있어 전체 목록의 신뢰성을 주장하지 않는다.

| 장소 | 위도 | 경도 | 비고 |
|---|---:|---:|---|
| Gyeongbokgung / 경복궁 | 37.580123 | 126.977032 | 궁역 내부의 대표 지점 |
| Bukchon / 북촌 | 37.578991 | 126.986382 | 넓은 동네의 남쪽 대표 지점 |
| Cheonggyecheon / 청계천 | 37.571336 | 127.024640 | 동쪽 하천 구간. 청계광장 좌표가 아님 |
| N Seoul Tower / 남산서울타워 | 37.551202 | 126.988196 | 전망 지점 |
| Ttukseom Hangang Park / 뚝섬한강공원 | 37.531547 | 127.066664 | 강변 공원의 대표 지점 |

Wikipedia 원문도 교차 확인하려 했으나 이 실행 환경의 프록시가 해당 도메인을 403으로 차단했다. 읽지 못한 원문을 확인했다고 표시하지 않는다. 이 버전은 내비게이션·측량·철도 운영 안내를 제공하지 않는다.

## 실행 의존성과 생성 에셋

Route Film 고유 SVG, 레이아웃, 절차적 장면, 사운드는 코드로 만든다. 외부 스톡 사진·영상·음원·완성 일러스트·3D 모델·생성형 이미지 에셋은 사용하지 않는다. 생성 모델 호출과 유료 API도 없다.

- `sharp` 0.35.5: Apache-2.0. 설치된 `@img/sharp-libvips-linux-x64` 패키지는 LGPL-3.0-or-later를 명시한다. 하위 라이브러리의 별도 라이선스도 해당 패키지에 포함된다. 버전은 `package-lock.json`으로 고정한다.
- `playwright-core` 1.64.1: Apache-2.0. 이미 설치된 Chromium으로 PDF를 출력하고 브라우저 검증을 수행한다.
- FFmpeg와 Chromium은 시스템 실행 파일이다. 이 저장소에서 바이너리를 재배포하지 않는다. FFmpeg의 활성 코덱·빌드 설정에 따른 라이선스는 배포자가 확인해야 한다.
- 글꼴은 시스템의 Noto CJK 계열을 우선 사용한다. 글꼴 바이너리는 저장소에 포함하지 않는다. 다른 시스템에서는 글꼴 차이로 줄바꿈과 픽셀이 달라질 수 있다.

원본 여행 JSON과 시드가 생성의 입력이다. 산출물과 중간 파일은 Git 추적에서 제외하고 재생성 방법은 README에 기록한다. 사실 데이터의 출처 표기와 창작 장면의 설명은 UI와 출력물에서도 유지한다.

- `esbuild` 0.28.2: MIT. 오프라인 아틀라스의 브라우저용 모듈을 import 의존성까지 번들링하는 도구로 사용하며, 배포 바이너리는 npm lockfile로 고정합니다.
