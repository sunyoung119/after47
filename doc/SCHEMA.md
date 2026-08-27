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

## 3상태 판정 (D-011)

Action은 사라지거나 나타나는 게 아니라 **상태를 갖는다.**

| 상태 | 조건 | 화면 |
|---|---|---|
| (없음) | `applies_when` 불일치 | 결과에 포함 안 됨 |
| `해당` | `applies_when` 일치 + `excluded_when` 불일치 | 할 일 / 진행 중 |
| `조건부` | `excluded_when` 일치 + `exception_available: true` | "원칙적으로 제외지만 예외 조항 있음 — 문의" |
| `제외` | `excluded_when` 일치 + `exception_available: false` | 흐리게, 제외 사유 표시 |

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
| `amount_known` | bool | 실제 금액 확인 여부 (현재 대부분 false) |
| `fallback` | string\|null | 미보유 구의 대체 근거 |
| `source_url` | string | 원문 주소 |
| `checked_at` | date | 마지막 확인일 |

`insurance_exclusion` 값이 넷인 것은 실제로 4변종이기 때문이다(§2-3).
`enrolled_self`(본인 가입)와 `enrolled_dwelling`(주택 가입)의 구분이 중요하다 —
임차인 본인은 보험이 없어도 건물에 보험이 있으면 제외되는 구가 있다.

**미결정**: 지원 항목(심리·폐기물 등)을 districts에 나열할지 actions에
구 목록을 둘지. 현재는 **actions 쪽에 `applies_when.district`로** 두고
데이터를 채워보며 판단한다.

---

## 2. actions

사실 축과 제도 축 통합. 순서 정보 없음(D-001).

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 슬러그 |
| `title` | string | 한 줄 |
| `body` | string | 안내 본문 |
| `domain` | int | 서비스 분야 1~10 |
| `category` | enum | `신청`\|`판단`\|`대기`\|`기관자율` (D-008) |
| `audience` | enum | `피해자`\|`조사관` |
| `axis` | enum | `사실`\|`제도` |
| `timing_hours` | int\|null | 사실 축 — 화재 후 N시간 내 |
| `deadline_days` | int\|null | 제도 축 — 신청 기한 |
| `wait_days` | [int,int]\|null | `대기` 항목의 예상 소요 범위 |
| `irreversible` | bool | 놓치면 회복 불가 (§0) |
| `applies_when` | object | 관련성 조건 |
| `excluded_when` | object\|null | 제외 조건 |
| `exception_available` | bool | 제외여도 예외 조항 존재 |
| `exclusion_reason` | string\|null | 제외 시 표시할 사유 |
| `depends_on` | [string] | 선행 action id (쌍 관계) |
| `blocks_reason` | string\|null | 선행 미완료 시 표시할 이유 |
| `knowledge_level` | `상식`\|`전문` | |
| `source_grade` | enum | `공적`\|`학술`\|`해외공적`\|`참고-업체`\|`출처필요` |
| `source_url` | string\|null | |
| `checked_at` | date | |

`depends_on`이 쌍 관계다. 전역 순서 배열이 아니다 — 조건이 바뀌어도
재계산되어야 하기 때문(D-001).

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

`district`는 URL 파라미터 `?d=` 에서, `completed`는 저장 계층에서 온다.
나머지는 전부 questions가 채운다.

```
district              자치구 id                     ← URL ?d=
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
water_damage_role     victim | causer | both | none   소화수 피해 가해·피해 구분
adjuster_present      bool  손해사정사 등장 여부
product_maker_contacted bool  제조사 접촉 여부
```

`water_damage_role`이 특히 중요하다. 물 피해를 **받은 쪽과 준 쪽은 지시가
정반대**다("관리사무소에 알리세요" vs "책임을 인정하지 마세요"). 이것을
`other_units_affected` 하나로 묶으면 반대 지시가 함께 노출된다.
`both`는 엔진에서 배열로 펼쳐 양쪽 조건에 모두 걸리게 한다.

### 파생 키

questions가 묻지 않고 `deriveState()`가 만든다. `applies_when`과 `ask_when`이
똑같이 읽는다.

```
elapsed_hours                  fire_at에서 계산
district_has_ordinance         자치구 조례 보유 여부
district_residency             none | address | address_and_actual
district_insurance_exclusion   none | enrolled_self | enrolled_dwelling | compensated
```

자치구 파생 키는 **조례 내용에 따라 질문을 켜고 끄기 위한 것**이다.
`ask_when: {"district_insurance_exclusion": "compensated"}` 는 보험금 수령을
제외 사유로 삼는 구에서만 그 질문을 띄운다. 구 목록을 questions.json에
하드코딩하면 자치구를 추가할 때마다 두 곳을 고쳐야 한다.

### "모름"은 언제나 `"unknown"` 문자열이다

3상태 키가 여섯이다.

```
scene_preserved  insurance_self  insurance_dwelling
other_units_affected  origin_area  product_suspected
```

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

```
evaluate(state, data) → {
  now:      [{action, status, reason}]   지금 해야 할 것
  waiting:  [{action, eta}]              기다리는 것
  blocked:  [{action, blocked_by}]       선행 미완료
  later:    [{action}]                   나중
  excluded: [{action, reason}]           제외·조건부
}
```

완료 상태(`done`)는 재방문 시 사용자가 체크한 것으로, state와 별도로
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

`standing`과 `anytime`의 경계가 흐려지기 쉽다. **`standing`은 "하지 마세요"만**
담는다. "무료로 신청할 수 있습니다"는 `anytime`이다.

## domain_group — 화면용 묶음 (v0.2)

내부 분야 10개를 사용자 언어 6개로 묶는다. 분야 번호는 관리용이고 이것이
화면에 나가는 이름이다.

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
