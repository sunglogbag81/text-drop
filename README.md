# Text Drop

GitHub Pages에서 바로 돌아가는 긴 글 링크 생성기입니다. 핸드폰 없이 인증 문구나 긴 메모를 잠깐 옮겨 적어야 할 때 쓰기 좋게 만들었습니다.

## 작동 방식

GitHub Pages는 서버 코드를 실행하거나 데이터를 저장할 수 없기 때문에, 이 앱은 글을 서버에 업로드하지 않습니다.

- 브라우저에서 글을 gzip 압축합니다.
- 압축한 데이터를 URL의 `#d=...` fragment에 넣습니다.
- fragment는 서버로 전송되지 않으므로 GitHub 서버에는 글 내용이 저장되지 않습니다.
- 삭제는 현재 브라우저의 저장 목록에서 제거하는 방식입니다. 이미 복사한 링크 자체는 폐기할 수 없습니다.

## 기능

- 긴 글 붙여넣기에 맞춘 큰 textarea UI
- 모바일 화면 대응
- 링크 생성 / 링크 복사 / 전체 내용 복사
- 이 브라우저에 최근 링크 저장
- 1시간/6시간/24시간/3일 만료 표시 옵션
- 서버, DB, 인증 없이 GitHub Pages 배포 가능

## 개발

```bash
npm run check
npm run build
npm run serve
```

## GitHub Pages

이 저장소는 `docs/` 폴더를 GitHub Pages 배포 대상으로 사용합니다.

Repository Settings → Pages → Build and deployment에서:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

## 주의

링크를 아는 사람은 내용을 볼 수 있습니다. 민감한 비밀을 오래 보관하는 용도로 쓰지 마세요. 긴 글일수록 URL도 길어지므로 메신저/브라우저의 URL 길이 제한에 걸릴 수 있습니다.
