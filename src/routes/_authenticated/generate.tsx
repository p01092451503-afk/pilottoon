import { createFileRoute, redirect } from "@tanstack/react-router";

// 이미지 스튜디오(/generate)는 "만들기"(/make)로 통합되었습니다.
// 기존 링크/북마크 보존을 위해 리다이렉트만 유지합니다.
export const Route = createFileRoute("/_authenticated/generate")({
  beforeLoad: () => {
    throw redirect({ to: "/make", replace: true });
  },
  component: () => null,
  head: () => ({ meta: [{ title: "Make · pilottoon" }] }),
});
