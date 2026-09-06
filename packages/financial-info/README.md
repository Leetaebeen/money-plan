# 금융상품 공식정보 수집기

금융감독원 금융상품통합비교공시 `금융상품 한눈에`의 정기예금·적금 API를
Node 환경에서 수집하는 패키지입니다. 브라우저 앱과 분리해 인증키가 클라이언트
번들에 포함되지 않도록 합니다.

## 원칙

- 공식 응답의 기본정보와 금리 옵션을 금융회사·상품 코드로 결합합니다.
- 출처, 공시 제출월, 금융회사 제출시각, 수집시각을 각 상품에 남깁니다.
- 인증키가 포함된 요청 URL은 결과나 오류에 기록하지 않습니다.
- 상품을 추천하거나 예상수익률을 만들지 않고 공시 사실만 정규화합니다.
- 응답 형식이 달라지면 조용히 누락하지 않고 수집을 중단합니다.

공식 안내:

- <https://finlife.fss.or.kr/finlife/main/contents.do?menuNo=700029>
- <https://finlife.fss.or.kr/finlife/main/contents.do?menuNo=700031>

## 실행

실제 인증키는 `.env` 파일이나 Git에 저장하지 말고 현재 셸 또는 배포 환경의
암호화된 비밀 저장소에 설정합니다.

```powershell
$env:FINLIFE_API_KEY = "<발급받은_인증키>"
npm run collect:finlife -- --kind all --group 020000 `
  --output apps/web/public/data/financial-products.json
```

`--kind`는 `deposit`, `saving`, `all`, `--group`은 금융회사 권역 코드이며
`--finance`로 금융회사 코드 또는 이름을 선택해서 전달할 수 있습니다. 결과 JSON은
버전이 있는 공개 스냅샷 계약으로 내보냅니다. `--output`을 생략하면 표준 출력에
표시하며, 지정하면 검증된 전체 JSON을 임시 파일에 쓴 뒤 대상 파일을 교체합니다.

## 갱신 보고서와 실행 이력

`npm run report:finlife -- --input apps/web/public/data/financial-products.json`으로
생성시각·경과시간·상품 수·금융회사 수·공시월을 확인합니다.
`--require-products --max-age-hours 1`은 상품이 없거나 생성 후 1시간을 넘긴
스냅샷을 실패 처리합니다. 공시월의 최신성을 보증하는 기준은 아닙니다.

Actions에서는 수집 직후 이 검사를 수행하고 `--github-summary`로 실행 요약을
남깁니다. 검증을 통과한 스냅샷 JSON은 실행·재실행별 아티팩트로 30일 보관됩니다.
이력은 수집 결과이며 Pages 배포 성공 여부는 별도 deploy-pages 작업에서 확인합니다.
키 없는 일반 푸시는 추적 중인 빈 스냅샷도 요약·보관하며, 생성시각은 미연결로 표시됩니다.

수집 또는 요약 검증 실패 시 실행 요약에 진단 안내가 표시되고 새 배포를 중단합니다.
실제 오류는 실패한 단계의 로그에서 확인하세요. 이메일·메신저 알림은 별도로 발송하지 않습니다.
