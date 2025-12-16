# WebRTC_v2
Found mDNS occurring display issues

## Playing Demo screen
<p align="center">
  <img src="https://github.com/user-attachments/assets/cb13643e-a983-4671-844f-0722bb61357f" width="400" alt="스크린샷 2025-11-04 195927">
  <img src="https://github.com/user-attachments/assets/c19f75fb-9564-4f41-99c8-67895c7c486a" width="400" alt="스크린샷 2025-11-04 195912">
</p>

### 실행법 간단 설명
 1. env, peer_ts>App.tsx 주소 맞게 변경
 2. Terminal 2개 실행 후
    - Server: \webRTC\WebRTC_KAU\Practice_webRTC> npm start
    - Client: \webRTC\WebRTC_KAU\Practice_webRTC\peer_ts> npm start
 3. peer_ts>App.tsx 에서 Mode: Mesh | SFU 설정 (SFU가 1-N임 추후 네이밍 변경예정 -> 변경해서 Commit 해주면 좋음)

### 추가 필요 사항
/* 1-N 에러 처리로직 */
** candidate 수신 전 , remotedescription 에러 생기는 지 확인 (비동기적 문제로 순서가 꼬이는 지 그리고, In case Error handler 여부 확인)
** disconnected가 될때 Reset처리 (Soft/Hard reset 올바르게 동작하는 지 확인; 현재는 주석 처리 해둠)

