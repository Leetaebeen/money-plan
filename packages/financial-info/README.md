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
npm run collect:finlife -- --kind all --group 020000
```

`--kind`는 `deposit`, `saving`, `all`, `--group`은 금융회사 권역 코드이며
`--finance`로 금융회사 코드 또는 이름을 선택해서 전달할 수 있습니다. 결과 JSON은
표준 출력으로만 내보냅니다.
