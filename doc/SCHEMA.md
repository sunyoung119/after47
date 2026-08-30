# 데이터 스키마 v0.1

3층 구조(D-001)의 1·2층. 3층 타임라인은 런타임 계산이므로 데이터에 없다.

엔티티는 셋. `conditions`와 `dependencies`는 별도 엔티티로 두지 않고
Action의 필드로 넣는다 — 조건은 Action에 붙는 속성이지 독립적으로 존재하지
않으며, JSON에서 별도 테이블은 읽기만 어려워진다.

---

## 조건 표현 규칙 (D-010)

`applies_when` / `excluded_when`은 **단순 매칭 + 배열**이다.

```
{ "district": ["gangnam", "guro"], "tenure": "renter" }
```

- 같은 키 안의 배열 → OR
- 다른 키끼리 → AND
- 값이 `null`이면 그 키는 무시(항상 참)
- state에 해당 키가 없으면(`undefined`) 불일치로 본다

논리 표현식을 쓰지 않는 이유는 `design-decisions.md` D-010 참조.
요약하면 **조건이 복잡해서 Action을 쪼개는 게 아니라 안내 내용이 달라서
어차피 쪼개야 하므로**, 표현식으로 조건을 합칠 이득이 없다.

나중에 정말 필요한 Action이 나오면 `applies_when_expr` 선택 필드를 열어
그것만 예외적으로 쓴다. 전부 표현식으로 가는 것과는 비용이 다르다.

---

## 판정 상태 — 넷 (D-011 · D-019 §6)

Action은 사라지거나 나타나는 게 아니라 **상태를 갖는다.**

| 상태 | 뜻 | 화면 |
|---|---|---|
| (없음) | `applies_when` 불일치 | 결과에 포함 안 됨 |
| `해당` | 아래 어느 제외에도 안 걸렸다 | 할 일 / 진행 중 |
| `조건부` | 제외에 걸렸으나 예외 조항이 있다 | "원칙적으로 제외지만 예외 조항 있음 — 문의" |
| `제외` | 제외에 걸렸고 예외 조항이 없다 | 흐리게, 제외 사유 표시 |
| `미판정` | 판정에 필요한 답이 아직 없다 | 무엇을 답하면 확정되는지 표시 |

**제외로 가는 경로는 셋이고 전부 `제외`/`조건부`를 만든다.**

| 경로 | 어디서 | 예외 조항을 무엇으로 보나 |
|---|---|---|
| Action 자체 | `excluded_when` 일치 | `action.exception_available` |
| 자치구 조례 | `districtExclusion()` — 주택 한정 · 거주 요건 · 보험 4변종 | `district.emergency_exception` |
| 신청 기한 도과 | `deadlineExclusion()` — `irreversible`은 제외(R3이 `missed`로 가져간다) | `district.emergency_exception` |

**`미판정`으로 가는 경로는 둘이다.** 둘 다 `districtExclusion()` 안에 있다.

- 자치구 미지정 — 조례 판정 자체가 불가능하다
- 보험 `unknown` — 단, **그 구의 `insurance_exclusion`이 실제로 보는 키가
  `unknown`일 때만**이다. 보험을 안 보는 구(`none`, 예: 성북)에서는
  모르는 채로도 `해당`이 확정이다

`미판정`은 판정 결과가 아니라 **판정 이전**이다. 그래서 `emergency_exception`을
보지 않는다 — 구청장 예외는 제외된 사람에게 열리는 문인데, 여기는 아직
제외인지 아닌지를 모른다. 확정 제외가 미판정보다 먼저다.

`제외`도 숨기지 않는다. "이런 지원이 있지만 당신은 이 사유로 해당되지 않는다"는
것 자체가 정보다. 다른 데서 듣고 혼란스러워하는 것보다 낫다.

`조건부`가 D-008에서 정한 "당신은 제외 대상입니다로 끝내면 안 된다"의 구현이다.

---

## 1. districts

자치구 25개. 조례 내용을 필드로 편 것.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 슬러그 (`gangnam`) |
| `name` | string | 표시명 (`강남구`) |
| `has_ordinance` | bool | 전용 조례 보유 여부 |
| `ordinance_name` | string\|null | 조례 정식 명칭 |
| `ordinance_no` | string\|null | 조례번호 (갱신 비교 기준) |
| `enacted` | date\|null | 제정일 |
| `amended` | date\|null | 최종 개정일 |
| `dept` | string\|null | 소관 부서 |
| `tier` | `full`\|`minimal`\|`none` | 조례 계열 (§2-2) |
| `insurance_exclusion` | enum | `none`\|`enrolled_self`\|`enrolled_dwelling`\|`compensated` |
| `deadline_days` | int\|null | 신청 기한 |
| `residency` | enum | `none`\|`address`\|`address_and_actual` |
| `housing_only` | bool | 주택 한정 여부 |
| `emergency_exception` | bool | 긴급 예외 조항 유무 |
| `amount_source` | enum | `attachment`\|`rule`\|`mayor`\|`none` |
| `amount_known` | bool | 실제 금액 확인 여부 (**25개 구 전부 false**) |
| `fallback` | string\|null | 미보유 구의 대체 근거 |
| `support_items` | [string] | 이 구가 지원하는 항목. `psych`·`waste`·`housing`·`supplies`·`meal`. Action의 `support_item`과 맞춘다. 여기 없으면 그 Action은 결과에서 아예 빠진다 |
| `exclusion_exempt_items` | [string] | 보험 제외를 **적용하지 않는** 항목 (양천: psych · housing) |
| `support_articles` | object | `{ support_item: "제5조제1항제3호" }`. 그 항목의 근거 조문. 키는 `support_items`의 부분집합이다 |
| `source_url` | string | 원문 주소 |
| `checked_at` | date | 마지막 확인일 |
| `exclusion_note` | string\|null | **판정에 쓰지 않는 기록용.** 원문이 enum에 정확히 안 맞을 때 그 사실을 남긴다. 현재 관악 1건 |

`support_items`·`exclusion_exempt_items`·`housing_only`·`residency`·
`insurance_exclusion`이 `districtExclusion()`이 직접 읽는 판정 핵심 필드다.
판정 순서는 **support_items → housing_only → residency →
exclusion_exempt_items → insurance**이고, 먼저 걸리는 것이 뒤를 가린다.

`insurance_exclusion` 값이 넷인 것은 실제로 4변종이기 때문이다(§2-3).
`enrolled_self`(본인 가입)와 `enrolled_dwelling`(주택 가입)의 구분이 중요하다 —
임차인 본인은 보험이 없어도 건물에 보험이 있으면 제외되는 구가 있다.

**문서의 4변종과 이 enum 4값은 같은 분류가 아니다.** `problem-definition`
§2-3의 네 줄은 조문의 *효과*로 묶은 것이고, enum은 **엔진이 볼 state 키**로
가른 것이다. "가입만 해도 제외" 한 줄이 enum에서는 원문 문언의 주체에 따라
`enrolled_self`(본인)와 `enrolled_dwelling`(주택)으로 갈리고, 양천의 "예외"는
enum 값이 아니라 `exclusion_exempt_items`라는 별도 필드다. **문서의 네 줄과
enum의 네 값을 1:1로 맞추지 마라.**

**enum에 정확히 안 맞는 원문은 `exclusion_note`에 남긴다.** 관악이 그렇다 —
「피해주택에 대한 화재보험이 가입되어 보험금을 지급받는 경우」로 주택 기준
가입과 보험금 수령이 AND로 묶여 있어 넷 중 어디에도 없다. `compensated`로
근사했고 근사라는 사실을 그 필드에 적었다. **엔진은 `exclusion_note`를 읽지
않는다** — 판정 규칙이 두 곳으로 흩어지면 계기판이 못 본다.

**지원 항목은 districts 쪽에 둔다**(`support_items`). 한때 actions에
`applies_when.district`로 구 목록을 두는 안과 저울질했으나, 자치구가 늘 때마다
Action을 고쳐야 해서 폐기했다 — 25개 전수를 채우는 동안 `actions.json`은
한 줄도 안 바뀌었다.

---

## 2. actions

사실 축과 제도 축 통합. 순서 정보 없음(D-001).

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 슬러그 |
| `title` | string | 한 줄 |
| `summary` | string | 한 문장. `body`는 펼쳐야 나온다 |
| `body` | string | 안내 본문 |
| `domain` | int | 서비스 분야 1~10 |
| `domain_group` | enum | 화면용 묶음 7종 (§domain_group). 분야 번호는 관리용이고 이것이 화면에 나간다 |
| `when` | enum | 배치 위치의 **기본값**. 실제 화면 위치는 `placement()`가 계산한다 (§when) |
| `category` | enum | `신청`\|`판단`\|`대기`\|`기관자율` (D-008) |
| `audience` | enum | `피해자`\|`조사관` |
| `axis` | enum | `사실`\|`제도` |
| `timing_hours` | int\|null | 사실 축 — 화재 후 N시간 내 |
| `deadline_days` | int\|null | 제도 축 — 신청 기한 |
| `wait_days` | [int,int]\|null | 예상 소요 범위. **`대기` 전용이 아니다** — 현재 2건이고 그중 하나는 `신청`이다 |
| `irreversible` | bool | 놓치면 회복 불가 (§0) |
| `guidance_type` | enum | `action`(실행 요구) \| `do_not`(금지) \| `awareness`(실행 요구 없는 판단정보). **`when`·`irreversible`·`rank`와 독립된 축이다** — 예: `scene-preserved-hold`는 `irreversible=false`지만 `do_not`이다. 현재 do_not 6 · awareness 2 · action 50이고 **전 58건이 값을 갖는다**(누락 시 기본값으로 때우지 않는다 — `engine.test.mjs`가 막는다) |
| `applies_when` | object | 관련성 조건 |
| `excluded_when` | object\|null | 제외 조건 |
| `exception_available` | bool | 제외여도 예외 조항 존재 |
| `exclusion_reason` | string\|null | 제외 시 표시할 사유 |
| `ordinance_based` | bool | **선택 필드(4건에만 있다).** 자치구 조례 지원 항목 |
| `support_item` | string | **선택 필드(4건에만 있다).** psych · waste · housing · supplies. districts의 `support_items`와 맞춘다 — 다만 `meal`은 **의도적으로 없다**(아래) |
| `depends_on` | [string] | 선행 action id (쌍 관계) |
| `blocks_reason` | string\|null | 선행 미완료 시 표시할 이유 |
| `knowledge_level` | `상식`\|`전문` | |
| `source_grade` | enum | `공적`\|`학술`\|`해외공적`\|`참고-업체`\|`출처필요` |
| `source_url` | string\|null | legacy. `sources`가 빌 때 '원문 보기'만 만든다 |
| `sources` | [object] | 구조화된 출처. **59건 중 35건**이 채워져 있다(아래) |
| `contacts` | [object] | 연락처. **59건 중 7건**이 채워져 있다(아래) |
| `checked_at` | date | |

`depends_on`이 쌍 관계다. 전역 순서 배열이 아니다 — 조건이 바뀌어도
재계산되어야 하기 때문(D-001).

`ordinance_based`와 `support_item`만 **없는 Action에는 키 자체가 없다.**
나머지는 전 항목에 키가 있고 값이 `null`이다.

**`meal`에 대응하는 Action은 없고, 그것이 결정이다.** districts의
`support_items` 어휘는 다섯인데 Action의 `support_item`은 넷뿐이다. 긴급급식
조항은 7개 구(광진·구로·금천·성북·송파·영등포·중구)에 있지만 전부 "구청장이
예산의 범위에서 지원할 수 있다"는 재량 규정이고, 금액·기간·신청서식이 없으며
하위 규칙은 25개 구 전수조사에서 0건이다. 대피소 급식 체계에 얹힌 항목이라
개별 주택화재에서 집행되는 그림이 없다 — **실행되는지 확인 안 된 제도는
안내하지 않는다**(D-020).

### 출처 — `sources[]`와 조례 조문

화면이 출처 카드를 그리려면 문서명·조문·발행처·확인일이 필요한데
`source_grade`/`source_url`/`checked_at` 셋으로는 만들 수 없다.
그래서 항목 배열을 둔다.

```json
"sources": [
  {
    "type": "law | ordinance | public_guidance | case | academic",
    "title": "제조물책임법",
    "article": "제3조의2",
    "publisher": null,
    "year": null,
    "url": "...",
    "doi": null,
    "checked_at": "2026-08-26"
  }
]
```

**지금 채워진 것은 35건이다.** 콘텐츠 패스가 legacy `source_url`을 하나씩
열어 문서명·법령명·조문을 확인해 이관했다(2026-08-30).

  법령 조문까지 대조   14건   상법 제662조·제684조 · 민법 제615조·제634조 ·
                             실화책임법 제2조·제3조 · 제조물 책임법 제3조의2·
                             제7조 · 보험업법 제185조 · 소방의 화재조사에 관한
                             법률 제16조 · 소방기본법 제49조의2(기존)
  법령명까지만 확인     5건   조문 본문을 못 읽은 것들(아래)
  공적 안내           12건   찾기쉬운 생활법령정보 6 · 법무부 1 · 해외 5
  판례                 1건   대법원 2010다71318
  학술                 2건   서울대학교 법학 2019

**나머지 24건은 비어 있고 그대로 둔다** — 21건은 legacy URL조차 없고
(`출처필요` 2건 포함), 3건은 원문 접근에 실패했다(kesco 루트 · USDA 403 ·
소비자24 메시지 페이지).

**URL이나 본문 문자열을 파싱해 법령명·조문을 만들어 내지 않는다.**
없는 것을 지어내느니 출처 영역을 안 그리는 편이 낫다. 키를 없는 항목에서도
빈 배열로 둔 것은 키 일관성 때문이다.

**대조한 곳과 링크가 다를 수 있다.** `law.go.kr`의 `법령/이름` 경로는 JS로
그려서 본문을 읽을 수 없어, 법령 조문 7건은 CaseNote 정적 페이지에서 조문을
대조했다. 다만 **링크는 공식 위치(국가법령정보센터 한글 조문주소)로 건다** —
사용자가 눌러서 가야 할 곳은 원본이기 때문이다. 각 주소는 셸 `<title>`로
법령명이 맞는지 확인했다. `publisher`는 링크가 가리키는 곳을 적는다.

  대조처   CaseNote                    조문 본문을 실제로 읽은 곳
  링크     www.law.go.kr/법령/…/제N조   사용자가 가는 곳(공식)

판례 1건(대법원 2010다71318)만 CaseNote 링크를 그대로 둔다 — 그 판결문의
공식 무료 열람처가 따로 없다.

**`article`을 비운 것은 2건이고 둘 다 조문이 없는 것이 정상이다** —
소방의 화재조사에 관한 법률(`investigation-report-wait`은 본문에 조문을
말하지 않는다) · 화재로 인한 재해보상과 보험가입에 관한 법률(법 전체가
대상). 나머지 셋(긴급복지지원법 · 공동주택관리법 2건)은 **사용자가
law.go.kr에서 원문을 복사해 주어 채웠다**(2026-08-30).

그 대조에서 **본문 인용 오류 하나가 드러났다.** `emergency-welfare`가
긴급복지지원법의 위기상황 조항을 **제2조 제9호**로 인용했는데 원문은
**제5호**다 — 제9호는 "보건복지부장관이 정하여 고시하는 사유"라는 포괄
조항이다. 문구도 원문과 달랐다(원문은 「화재 **또는 자연재해 등으로**
인하여」). 본문을 원문대로 고쳤다. **법이 화재를 이름으로 명시한다는
이 Action의 근거 자체는 그대로다.**

기존 세 필드는 호환을 위해 그대로 두고, 화면은 이 순서로 읽는다.

1. `sources`가 비어 있지 않으면 → 문서명·조문·발행처·확인일 + 정확한
   URL이 있을 때만 '원문 보기'
2. 비어 있고 `ordinance_based`면 → **자치구 조례**에서 조합한다
   (`ordinance_name` + `support_articles[support_item]` + `checked_at`).
   원문 URL은 붙이지 않는다 — 지금 가진 것은 elis 홈페이지 주소뿐이고,
   홈페이지를 '원문 보기'로 걸면 정확한 원문이라는 거짓말이 된다
3. 그것도 없고 legacy `source_url`만 있으면 → **문서명 없이** '원문 보기'만
4. 아무것도 없으면 → 출처 영역을 통째로 그리지 않는다

**조문은 Action이 아니라 자치구에 귀속된다.** 같은 `psych` 항목이라도
구마다 조문 번호가 다르다(강남 제5조제1항제1호 / 구로 제5조제1호 / 관악
제4조제1항제1호…). Action에 적으면 25구 중 하나에서만 맞는 값이 된다.
그래서 `districts.json`의 `support_articles`에 둔다 — 조례 보유 13구
47항목을 원문에서 직접 판독해 채웠고 추정은 없다. 특정하지 못한 항목은
**키를 넣지 않는다.**

`source_grade`는 **"검증됨"이라는 뜻이 아니다.** 화면에 `검증됨`·
`공식 인증` 같은 말을 쓰지 않는다(D-005 · D-006).

`support_items`의 `meal`은 **지우지 마라.** 그것은 조례가 무엇을 지원한다고
써놨는지의 기록이고, 지우면 데이터가 조례를 틀리게 기술한다. 결손이 아니라
결정이라는 것을 `test/districts.test.mjs`가 이름과 주석으로 박아 둔다.

**선행은 완료 가능한 행동이어야 한다**(D-018). `standing`(금지)을
`depends_on`에 넣지 마라 — 금지는 체크할 수 없어서(`checkable: false`)
그 뒤의 항목이 영원히 풀리지 않는다.

### 연락처 — `contacts[]`

"다음에 누구에게 넘어가야 하는지"를 말하려면 창구가 필요하다. `dept`는
자치구 조례 항목에만 있고 그것도 부서명뿐이라, 국가 제도 쪽에는 걸 곳이
없었다.

```json
"contacts": [
  {
    "org": "대한법률구조공단",
    "tel": "132",
    "url": "https://www.klac.or.kr/legalstruct/telephoneConsultation.do",
    "note": "전화상담 평일 09:00~11:50 · 13:00~17:50",
    "checked_at": "2026-08-30",
    "verified_at_url": "https://www.klac.or.kr/legalstruct/telephoneConsultation.do"
  }
]
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `org` | string | 기관명. 필수 |
| `tel` | string\|null | 숫자와 하이픈만. `tel:` 링크에 그대로 들어간다 |
| `url` | string\|null | **그 서비스로 바로 가는 페이지.** 기관 대문을 딥링크처럼 쓰지 않는다 |
| `note` | string\|null | 한 줄 보조 설명. 운영시간·처리기간처럼 숫자로 |
| `checked_at` | date | 확인한 날 |
| `verified_at_url` | string | **번호·주소를 확인한 공식 페이지.** 필수 |

`tel` 또는 `url` 중 최소 하나가 있어야 한다. `test/districts.test.mjs` §6이
전부 검사한다.

**`verified_at_url`이 이 구조의 핵심이다.** 번호는 사람이 실제로 거는
값이라 틀린 값이 빈 값보다 나쁘다. 리서치 문서나 검색 결과를 옮겨 적지
말고 **기관 공식 페이지에서 직접 확인한 뒤 그 주소를 적는다.** 확인이 안
되면 기입하지 않는다 — 비어 있는 것은 실패가 아니다.

**지금 채워진 것은 7건이다.** 1군 5건(2026-08-30) —
`emergency-welfare`(129) · `fire-cert`(정부24) · `legal-aid-klac`(132) ·
`consumer-dispute-mediation`(1372) · `financial-dispute-mediation`(1332) —
에 콘텐츠 패스가 둘을 더했다: `recall-lookup`(소비자24) ·
`housing-mgmt-dispute-committee`(중앙 공동주택관리 분쟁조정위원회).
**뒤 둘은 사이트 제목까지만 확인돼 `tel`이 없다** — 두 사이트 모두 본문을
JS로 그려서 번호를 읽지 못했다. 없는 번호를 만들지 않는다.

**조례 항목에는 달지 않는다.** 그쪽 문의처는 구청(`dept`)이고, 국가 번호를
달면 25개 구 전부에서 같은 번호가 구청 창구인 것처럼 보인다. 심리 지원의
국가 경로는 별도 Action 검토 대상이다(백로그).

**Action 상세가 1차 문의처 하나를 그린다**(커밋 `485020a`). 목록 카드에는
넣지 않고, `contacts`가 비면 줄 자체를 그리지 않는다.

---

## 2-b. directory.json — 전역 연락처 목록

연락처 페이지가 읽을 목록이다. 항목 스키마는 Action의 `contacts`와 같고
`group` 하나가 더 있다.

```json
{
  "group": "긴급 | 복지·긴급지원 | 법률·분쟁 | 심리",
  "org": "소방청 119", "tel": "119",
  "url": "https://www.nfa.go.kr/nfa/", "note": "화재·구조·구급 신고",
  "checked_at": "2026-08-30",
  "verified_at_url": "https://www.nfa.go.kr/nfa/"
}
```

**전부 공식 페이지에서 직접 확인한 것만 있다**(8건 · 4그룹).

  긴급           119 소방청 · 112 경찰청
  복지·긴급지원   129 보건복지상담센터 · 120 다산콜재단
  법률·분쟁      132 대한법률구조공단 · 1372 소비자상담센터 · 1332 금융감독원
  심리           1670-9512 재난심리회복지원센터

**없는 편이 틀린 것보다 낫다**가 이 파일의 규칙이다. 확인하지 못한 번호는
넣지 않는다 — 번호는 사람이 실제로 거는 값이라 틀린 값이 빈 값보다 나쁘다.

**구청 번호는 넣지 않는다.** 25개 구의 부서 직통을 확인할 경로가 아직 없다
(D-003의 `dept`도 9개 구가 `null`이다).

같은 번호를 두 줄로 싣지 않는다 — 목록에서 같은 창구가 두 번 나오면 어느
쪽으로 걸어야 하는지를 사용자가 다시 판단해야 한다.
`test/districts.test.mjs` §7이 전부 검사한다.

---

## 3. questions

사용자에게 묻는 것. 각 질문이 어떤 state 키를 채우는지 명시.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | |
| `key` | string | 채우는 state 키 |
| `text` | string | 질문 문구 |
| `type` | enum | `single`\|`date` |
| `default` | any\|null | 안 물었거나 아직 안 답했을 때의 값 (선택 필드) |
| `options` | [{value,label}] | |
| `ask_when` | object\|null | 조건부 질문 (앞 답변·자치구 파생값에 따라) |
| `help` | string\|null | 왜 묻는지 |

**배열 순서가 곧 질문 순서다.** `ask_when`이 참조하는 키를 채우는 질문은
반드시 그보다 앞에 있어야 한다. 앞뒤가 뒤집히면 그 조건은 영원히 거짓이 되고
질문이 화면에 뜨지 않는다. `test/questions.test.mjs` §2가 이것을 검증한다.

`ask_when`으로 질문 수를 줄인다. 예: 자가면 임대차 질문을 건너뛴다.

**생략해도 값은 남는다.** `ask_when`으로 숨긴 질문도 `default`가 있으면
채워진다. 안 물어봤을 뿐이지 값이 없는 것이 아니다. 지역 비교 레이어는
다른 자치구 기준으로도 판정하므로 여기가 비면 비교가 틀린다.

`default`가 없는 질문은 생략하면 안 된다. 값을 추정할 수 없기 때문이다.
`registered_resident`가 그 예다 — 주민등록 요건이 없는 구에서도 묻는다.
그 구에서는 안 쓰지만 다른 구와 비교할 때 필요하다.

---

## state 키 목록

questions가 채우고 규칙엔진이 읽는 값들.

`district`는 URL 파라미터 `?d=` 에서, `completed`와 `completed_at`은 저장
계층에서 온다. 나머지는 전부 questions가 채운다.

```
district              자치구 id                     ← URL ?d=
completed             [action_id]                   ← 저장 계층
completed_at          { action_id: ISO시각 }        ← 저장 계층
fire_at               화재 발생 일시 → elapsed_hours 계산
tenure                owner | renter
housing_type          house | apartment | officetel | other
registered_resident   bool  주민등록 + 실거주
insurance_self        true | false | "unknown"   본인 화재보험
insurance_dwelling    true | false | "unknown"   주택/건물 화재보험 (단체보험 포함)
compensated           bool  보험금·보상금·손해배상금 수령
residence_possible    bool  현재 거주 가능 여부
origin_area           "common" | "private" | "unknown"   공용부/전용부
product_suspected     true | false | "unknown"   제조물 결함 의심
scene_preserved       true | false | "unknown"   현장보존 조치 중
wet_appliances        bool  물에 젖은 가전 있음
powder_present        bool  소화약제 분말 잔존
other_units_affected  true | false | "unknown"   타 세대 피해
water_damage_home     true | false | "unknown"   우리 집 소화수 피해
water_damage_neighbor true | false | "unknown"   이웃 세대 소화수 피해
report_received       bool  화재현장조사서를 받았는가 (after_report를 여는 키)
adjuster_present      bool  손해사정사 등장 여부
product_maker_contacted bool  제조사 접촉 여부
```

`report_received`는 **7일이 지나야 묻는다** — `q-report`의 `ask_when`이
`elapsed_bucket`을 본다. 그 전에는 `default: false`로 채워진다. 조사서가
나오기 전에 "받으셨나요"를 묻는 것은 답할 수 없는 질문이다.

**물 피해는 독립된 두 축이다.** 받은 쪽과 준 쪽은 지시가 정반대라서
("관리사무소에 알리세요" vs "책임을 인정하지 마세요") 한 키로 묶으면 반대
지시가 함께 노출된다. 그렇다고 역할 하나로 묶는 것도 안 된다 — 둘 다 겪은
사람이 있고, 한쪽만 아는 사람도 있다.

그래서 **사용자는 `both`를 고르지 않는다.** 우리 집이 젖었는지와 이웃이
젖었는지를 따로 묻고, 둘 다 겪은 사람은 두 키가 각각 `true`가 된다.
한쪽만 모르는 사람은 그 키만 `"unknown"`이다 — 옛 5지선다에서 표현할 수
없던 상태이고, D-016의 미결이 바로 그 자리였다.

`other_units_affected`(이웃 세대 피해)와 헷갈리지 마라. 그쪽은 **물 피해를
제외한** 피해이고 질문 문구가 그렇게 못박는다.

이 서비스의 V1 사용자는 **자기 집에서 화재가 발생한 세대**다. "위층 화재로
우리 집이 젖은 남의집-화재 피해자"는 스코프 밖이고, 두 축의 조건과 본문이
그 전제 위에 있다.

### 파생 키

questions가 묻지 않고 `deriveState()`가 만든다. `applies_when`과 `ask_when`이
똑같이 읽는다.

```
elapsed_hours                  fire_at에서 계산 (시간 단위 정수)
elapsed_bucket                 immediate | first_hours | first_week | first_month | months | years
district_has_ordinance         자치구 조례 보유 여부
district_residency             none | address | address_and_actual
district_insurance_exclusion   none | enrolled_self | enrolled_dwelling | compensated
```

`deriveState()`에는 **배열로 펼치는 값이 없다.** 옛 `water_damage_role`의
`both`를 `["victim","causer"]`로 펼치던 코드가 있었는데 두 축으로 쪼개면서
사라졌다 — 둘 다 겪은 사람은 두 키가 각각 `true`라 펼칠 것이 없다.

**`elapsed_bucket`의 소비자는 `ask_when` 하나다.** 재배치(`placement()`)는
이 키를 쓰지 않고 항목마다 자기 시간 필드와 `elapsed_hours`를 직접 비교한다 —
구간으로 뭉개면 같은 구간 안의 4시간과 24시간이 구별되지 않는다. 데이터의
조건은 범위 비교를 못 하므로(D-010) 시점별 설문 분할은 이산값을 배열 OR로
받아야 하고, 그래서 이 키가 있다. 경계 4h·48h·30d·1095d는 데이터에 실재하는
값이고 7d만 임의다(D-017 §1).

자치구 파생 키는 **조례 내용에 따라 질문을 켜고 끄기 위한 것**이다.
`ask_when: {"district_insurance_exclusion": "compensated"}` 는 보험금 수령을
제외 사유로 삼는 구에서만 그 질문을 띄운다. 구 목록을 questions.json에
하드코딩하면 자치구를 추가할 때마다 두 곳을 고쳐야 한다.

### "모름"은 언제나 `"unknown"` 문자열이다

```
scene_preserved  insurance_self  insurance_dwelling
other_units_affected  origin_area  product_suspected
```

여기에 물 피해 두 축이 더해져 **"모름"을 값으로 갖는 키는 여덟이다.**

```
water_damage_home  water_damage_neighbor
```

둘 다 `true | false | "unknown"` 3상태다. `false`(물 피해가 없다)와
`"unknown"`(젖었는지 모른다)은 다른 뜻이고, 합치면 "모르겠다"가 "피해
없음"이 되어 수손 안내가 통째로 사라진다(D-016).

여덟 중 `origin_area`만 `true|false` 축이 아니다 —
`"common" | "private" | "unknown"`이고 세 번째가 "모름"이다.

**`null`을 "모름"으로 쓰지 마라.** 한때 보험 세 키가 `null`이었는데
`matches()`에서 `null`은 `true` 조건에도 `false` 조건에도 안 걸려서,
모른다고 답한 사람이 양쪽 안내를 다 못 받았다. 값은 있는데 아무 데도
안 걸리는 상태였고 조건만 보고는 알아채기 어렵다.

`"unknown"`은 조건에 명시적으로 써야 걸린다. 빠뜨리면 눈에 보인다.
`test/questions.test.mjs`가 `null` 선택지를 금지한다.

조사 직후에 모르는 것이 정상인 키는 기본값도 `unknown`이다.

`unknown`일 때 **금지·불가역·기록은 켜고 제도 안내는 켜지 않는다.**
제품을 버리지 말라는 것은 틀려도 손해가 없지만, 리콜 조회나 소비자원 조정을
원인도 모르는 사람에게 들이미는 것은 노이즈다. D-006의 "금지가 권장보다
안전하다"를 조건에 반영한 것이며, `applies_when: {"product_suspected":
[true, "unknown"]}` 처럼 배열 OR로 표현한다(D-010).

**`unknown`을 조건에 넣을지는 Action마다 판단한다.** 키 단위로 일괄 적용하면
안 된다 — 같은 `insurance_self`인데 시효 안내는 켜고 담보 범위 설명은 끈다.
판단 기준과 여섯 키의 적용 결과는 D-013.

---

## 엔진 계약

**정본은 `src/engine.js`다.** 아래는 100조합(`test/engine.snapshot.mjs`)을
돌려 실측한 현재 반환이다.

```
evaluate(state, data, now = Date.now()) → {
  sections: [{key, label, count, unlocked, groups}]   화면에 펴는 것
  done:     [행]   사용자가 체크한 것
  waiting:  [행]   category가 "대기"인 것
  blocked:  [행]   선행이 안 끝났고 되돌릴 수 있는 것
  excluded: [행]   해당이 아닌 것 — 제외 · 조건부 · 미판정
}
```

`now`는 안쪽 `deriveState()`까지 흘러간다. 세 번째 인자를 주면 시각이
고정되고, 안 주면 실행할 때마다 다른 결과가 나온다.

### 행 — 모든 버킷과 섹션이 같은 모양이다

15개 키가 **전부 있다.** 값이 없으면 `null`이지 키가 빠지지는 않는다
(키 일관성 규칙 — UI가 `undefined`를 만나지 않는다).

| 키 | 타입 | 내용 |
|---|---|---|
| `action` | object | actions.json 원본 객체 통째 |
| `status` | enum | 해당 · 조건부 · 제외 · 미판정 · **완료**(done 버킷만) |
| `reason` | string\|null | 제외·조건부·미판정의 사유 |
| `blockedBy` | [{id, title}] | 아직 안 끝난 선행. **제목이 함께 온다** — UI가 "'OO'을(를) 먼저 하세요"를 조합한다 |
| `blocks_reason` | string\|null | 왜 이 순서인지의 특수 설명. 데이터에 5건뿐이고 나머지는 `null` |
| `dept` | string\|null | 조례 항목의 소관 부서. 조례 항목이 아니면 `null` |
| `amount_known` | bool\|null | 조례 항목의 금액 확인 여부. D-003의 degrade를 districts.json 없이 그리기 위한 것 |
| `deadline_days` | int\|null | 행 수준 기한. Action 값이 없으면 조례 항목에 한해 자치구 값이 온다 |
| `group` | enum | `domain_group`. 섹션은 `groups`로도 주지만 버킷 행에는 이것뿐이다 |
| `category` | enum | 신청 · 판단 · 대기 (`기관자율`은 audience 필터에서 빠진다) |
| `wait_days` | [int,int]\|null | "얼마나 기다리나". 현재 2건 — `investigation-report-wait` `[15,60]`(`대기`) · `dispute-mediation` `[0,40]`(`신청`). **`category`로 이 값의 유무를 추정하지 마라** |
| `when` | enum | **계산된** 화면 위치. `action.when`이 아니라 `placement()`의 결과다 |
| `checkable` | bool | 체크 가능 여부. `standing`과 `locked`가 `false` |
| `locked` | bool | 선행이 안 끝났는데 제자리에 남은 행 (D-019 §5) |
| `rank` | int\|null | 화면을 가로지르는 순위. **엔진은 자르지 않는다** |

`done` 버킷의 행만 두 키를 더 갖는다(17키). 다른 버킷에는 없다.

| 키 | 타입 | 내용 |
|---|---|---|
| `status_if_pending` | enum | 완료가 아니었다면 무엇이었는지 (실측 값: `해당`·`제외`) |
| `completed_at` | string|null | 체크한 시각(ISO). 기록이 없으면 `null` |

**`completed_at`이 `null`이라고 완료가 아닌 것은 아니다.** 완료 여부의
진실은 `completed` 배열이고 이 키는 "언제"만 담는다. 이 키가 없던 사용자,
그리고 `report_received`로 충족된 `investigation-report`가 `null`로 온다 —
마이그레이션은 하지 않는다(D-002: 저장 계층은 state를 통째로 저장하므로
새 키가 그대로 실린다).

**`reason`이 값을 갖는 것은 `excluded` 행뿐이다**(제외 · 조건부 · 미판정).
`done` 행의 `reason`은 `status`와 함께 `null`로 정규화된다 — 완료로
이겼지만 원래 판정이 제외였던 경우에도 사유를 남기지 않는다. 완료한
사람에게 "기한이 지났을 수 있습니다"는 틀린 말이고, 무엇이었을지는
`status_if_pending`이 담는다(D-019 §10).

### rank — 어디에 값이 있고 어디가 null인가

| | rank |
|---|---|
| `sections` 중 `standing` **밖** | 1부터의 정수 |
| `sections` 중 `standing` | `null` — 타임라인 밖 별도 밴드라 순위 경쟁에 없다 (D-019 §0) |
| `done` · `waiting` · `blocked` · `excluded` | `null` — 접히는 자리라 순위가 없다 |

`locked`도 섹션 행에서만 켜진다.

**자르는 것은 UI다.** `rank <= 5`를 펴면 D-019 §1의 "1+4"가 된다.
나머지는 라벨과 개수로 접는다 — Action은 사라지지 않는다(D-011).

### 섹션

```
{ key, label, count, unlocked, groups: [{group, items: [행]}] }
```

- `key`/`label` — §when의 6종. **빈 섹션은 보내지 않는다**
- `count` — 그 섹션의 행 수(그룹 합)
- `unlocked` — 모든 섹션에 있다. `after_report`만 `report_received === true`일
  때 참이고 나머지는 항상 참. 섹션 객체의 모양이 일정해야 UI가 분기 없이 읽는다
- `groups` — `domain_group`으로 묶은 것. 섹션 안쪽 정렬은 `timing_hours`이고
  `rank`와 별개다. 순위는 화면을 가로지르는 값이고 이것은 블록 안의 값이다

### 버킷에 들어가는 순서 — 먼저 걸리는 것이 뒤를 가린다

1. **`done`** — 체크했고 `checkable`이면. **어떤 판정보다도 먼저다**(D-018).
   30일 안에 신청을 마친 사람이 90일 뒤에 열었을 때 "기한이 지났습니다"가
   아니라 "완료"를 봐야 한다. `status`는 `"완료"`로 정규화되고 원래 판정은
   `status_if_pending`에 남는다
2. **`excluded`** — `status`가 `해당`이 아닌 것 전부(제외 · 조건부 · 미판정)
3. **`blocked`** — 선행이 안 끝났고 **`irreversible`이 아닌 것.**
   불가역이면 `placement()`가 가리키는 섹션에 `locked: true`로 남는다
4. **`waiting`** — `category`가 `대기`
5. **섹션** — 나머지

버킷 이름이 내용보다 넓은 자리가 하나 있다. **`blocked`는 "선행이 안 끝난 것"
전부가 아니라 "그중 되돌릴 수 있는 것"이다**(D-019 §5).

**`standing`은 `blocked`로 가지 않는다.** 선행이 있어도 분배에서
무시한다(4/4-E) — 접히면 타임라인 밖 밴드에도 섹션에도 없어 금지가 화면에서
사라지기 때문이다. `blockedBy`는 행에 그대로 남는다.

### 계기판이 기록하는 것은 이 중 일부다

`test/engine.snapshot.mjs`의 `bucketRow()`는 `action` 객체 통째가 아니라
`id`만 남기고, `rank`·`locked`·`when`·`checkable` 대신 `irreversible`을
기록하는 식으로 요약한다. **스냅샷에 없는 필드가 계약에 없는 것은 아니다.**
전체 계약은 위 표이고 정본은 코드다.

완료 상태는 재방문 시 사용자가 체크한 것으로, state와 별도로
`completed: [action_id]` 배열로 관리한다(D-002 저장 계층).

---

## when — 배치 위치 (v0.2)

| 값 | 화면 블록 | 뜻 |
|---|---|---|
| `missed` | 혹시 아직 안 하셨다면 | 시한이 이미 지났을 수 있음. 압박하지 않는 문구로 |
| `today` | 오늘 하실 것 | |
| `standing` | 당분간 하지 마실 것 | **금지사항 전용.** 창구 안내를 여기 넣지 말 것 |
| `this_week` | 이번 주에 하실 것 | |
| `anytime` | 계속 신경 쓸 것 | 언제든 쓸 수 있는 창구, 시효, 관찰해야 할 증상 |
| `after_report` | 조사서가 나온 뒤에 | 화재현장조사서·감정 결과가 있어야 판단 가능 |

**데이터의 `when`은 기본값이지 화면 위치가 아니다.** 실제 위치는
`placement(action, elapsed_hours, deadline_days)`가 계산한다(D-017). 순수
함수이고 규칙은 여섯이다 — `standing`과 `after_report`는 안 움직이고(R0·R1),
시한이 지나면 `irreversible`만 `missed`로 내려가며(R2·R3·R4), 시간 필드가
없는 `this_week`만 기간이 지나면 `anytime`으로 간다(R5, 사실 축 7일 / 제도
축 30일). 신청 기한이 지난 것은 `missed`가 아니라 `excluded`다 —
`missed`는 `irreversible` 전용이다(D-017 §3).

`after_report`는 시간이 아니라 `report_received`로 열린다. 재배치하지 않고
섹션의 `unlocked` 플래그로 표시한다.

**`standing`은 선행을 갖지 않는다**(D-018의 짝). 데이터에서 뺐고
(`adjusters-may-all-be-opposing`이 유일한 위반이었다), 엔진도 분배에서
`standing`의 `depends_on`을 무시하며, 불변식이 "`blocked` 버킷에
`standing` 0건"을 본다. 접히면 타임라인 밖 밴드에도 섹션에도 없어
**금지가 화면에서 통째로 사라지기 때문이다**(D-019 §0).

`standing`과 `anytime`의 경계가 흐려지기 쉽다. **`standing`은 "하지 마세요"만**
담는다. "무료로 신청할 수 있습니다"는 `anytime`이다.

## domain_group — 화면용 묶음 (v0.2)

내부 분야 10개를 사용자 언어 **7개**로 묶는다. 분야 번호는 관리용이고
이것이 데이터에 들어가는 값이다.

| 그룹 | 분야 |
|---|---|
| 몸 | 1 안전·건강, 10 심리 |
| 지낼 곳 | 2 임시거처·생활지원 |
| 집 정리 | 8 청소·폐기물 |
| 서류 | 3 행정서류 |
| 보험과 돈 | 4 보험 |
| 집주인과 계약 | 5 임대차 |
| 책임과 분쟁 | 6 제조물, 7 타세대·공용부, 9 법률·분쟁 |

초기에는 4·5·6·7·9를 "돈과 책임" 하나로 묶었으나 3차 리서치 병합 후 그 그룹이
38개가 되어 묶음의 의미가 사라졌다. 셋으로 분리했다.

### 표시 라벨은 값과 다르다 (D-023)

화면에서 부르는 이름이 둘 다르다. **데이터의 `domain_group`은 바꾸지
않는다** — 엔진·계기판·테스트가 그 값을 본다.

| 값 | 화면 표시 |
|---|---|
| `몸` | 건강 |
| `서류` | 필요서류 |
| 나머지 다섯 | 그대로 |

`src/ui/copy.js`의 `TOPIC_LABEL`이 그 맵이고 `TOPIC_ORDER`가 주제별로 보기의
배열 순서다. `STATUS_LABEL`이 엔진 status에 하는 일과 같은 계층이다.
