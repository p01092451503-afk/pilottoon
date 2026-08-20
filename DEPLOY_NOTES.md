# 배포 노트 — Seedream V21.7 방식 전환

## 필수 환경변수 변경

`ARK_BASE_URL` 은 이제 **API 루트가 아니라 완전한 이미지 생성 엔드포인트 URL** 이어야 합니다.

```
ARK_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3/images/generations
```

기존처럼 `.../api/v3` 만 설정되어 있으면 이미지 생성 요청이 실패합니다.
(비디오 생성 / 연결 상태 점검 코드는 이 값에서 API 루트를 자동으로 되돌려 사용하므로 영향이 없습니다.)

## 이번 변경으로 의도적으로 제거된 것

- ARK 요청 자동 재시도(429 backoff)
- 응답 헤더 기반 request-id / providerResponseIds 추적
- SensitiveContent / ContentPolicy 감지 후 안내 문구 치환 (이제 ARK 원본 오류 그대로 기록)
- 참조 이미지 signed URL 전달 (→ base64 dataURL 직접 전달)
- seed 파라미터 전송 및 seed 기반 실제 variation (배치는 프롬프트 variation 문구로 대체)

## 추가된 DB 컬럼 (generations)

- `raw_responses` jsonb — 배치 회차별 ARK raw 응답 누적
- `reference_files` jsonb — `{ figure, role, file, apiOrder }[]`
- `warnings` jsonb — buildPrompt 경고 코드
- `user_memo` text — 자유 메모
