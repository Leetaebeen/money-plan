# Cloudflare Pages 이전 준비

현재 운영은 GitHub Pages이며 이 문서만으로 이전이 실행되지는 않습니다. 기존 주소와 데이터는 유지합니다.

## 준비한 배포 구성

- 저장소 루트에서 `npm ci --ignore-scripts --audit=false` 후 `npm run build:cloudflare`, `npm run check:cloudflare` 실행.
- 업로드할 정적 결과물은 `apps/web/dist`입니다. GitHub Pages용 `build:pages` 결과와 혼용하지 않습니다.
- 루트 경로 빌드는 `_headers`와 명시적 `404.html`을 생성합니다. 삭제한 URL이 앱으로 되돌아오는 SPA 기본 처리를 막습니다.
- 응답 헤더: CSP(외부·인라인 스크립트 제한, frame-ancestors none), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy no-referrer, Permissions-Policy.
- Vite 미리보기와 배포 헤더는 같은 정책에서 생성합니다. CI는 root 빌드의 헤더 파일·자원 경로와 기존 GitHub Pages 빌드를 모두 검사합니다.
- `_headers`는 Cloudflare Pages 정적 응답용입니다. Pages Functions/SSR을 추가하면 별도 응답 헤더 처리가 필요합니다.

## 실제 이전 순서

1. 기존 사이트의 백업 메뉴에서 암호화 `.moneyplan` 파일을 저장합니다. 다운로드 파일을 다시 선택하고 **백업 파일 검증 (현재 데이터 유지)**으로 읽히는지 확인합니다. 암호는 채팅·저장소에 적지 않습니다.
2. Cloudflare 계정과 배포 방식을 확인합니다. 현재 준비에는 계정 연결, 토큰 생성, 새 사이트 게시가 포함되지 않습니다. 토큰이 필요하면 배포 서비스의 비밀 설정에만 보관합니다.
3. CI가 통과한 main 커밋으로 새 고정 주소에 배포합니다. 임시 미리보기 주소에는 실제 가계부를 입력하지 않습니다. 실제 응답 헤더, 홈/탭 이동, 자원 로드, 없는 주소의 404, 암호화 백업 다운로드를 먼저 확인합니다.
4. 새 고정 주소의 백업 메뉴에서 파일과 암호를 입력하고 **복원 내용 확인**을 누릅니다. 교체되는 내용을 확인한 후 복원합니다. 기존 가계부는 브라우저 출처별로 저장되므로 자동 이동되지 않습니다.
5. 계좌·거래·목표·월급 계획·납부 일정·만기 계획·계획 이력을 기존 사이트와 비교합니다. 새 사이트에서도 백업을 만들어 검증합니다.
6. 사용자 확인 후 기본 사용 주소를 전환합니다. 기존 사이트는 백업·복귀 경로로 남기며 자동 리디렉션이나 데이터 삭제를 하지 않습니다. 두 사이트에 나눠 입력하지 않습니다.

## 완료 기준과 복귀

준비 파일 검사 통과만으로 서버 헤더가 적용됐다고 판단하지 않습니다. 새 주소의 실제 HTTPS 응답으로 헤더를 확인해야 합니다. 현재 GitHub Pages 응답 헤더는 변경되지 않습니다.
복원이나 검증이 실패하면 기존 사이트를 계속 사용합니다. 새 사이트에만 추가한 기록이 있다면 새 백업을 만든 뒤 비교·복원 여부를 결정합니다. 어느 저장소도 자동 삭제하지 않습니다.

공식 문서: https://developers.cloudflare.com/pages/configuration/headers/
404 동작: https://developers.cloudflare.com/pages/configuration/serving-pages/
