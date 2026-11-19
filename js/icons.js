// 화면에 쓰는 아이콘 한 벌. 그림 문자(이모지) 대신 직접 그린 선 아이콘이라
// 어느 컴퓨터·휴대폰에서도 같은 모양이고, 색은 주변 글자 색을 그대로 따라갑니다(원색 없음).
// 규칙: 24×24 칸, 선 굵기 1.8, 끝과 모서리는 둥글게.
const P = {
  island: '<path d="M3 19c2.4-1.3 4.8-1.3 7.2 0s4.8 1.3 7.2 0c1.2-.6 2.4-.9 3.6-.6"/><path d="M6.5 16.2c2-1 8.5-1 11 0"/><path d="M12 16V9"/><path d="M12 9c-1-2.2-3.6-3.2-6.2-2.6M12 9c1-2.2 3.6-3.2 6.2-2.6M12 9c-2.2.1-4 1.6-4.4 3.6M12 9c2.2.1 4 1.6 4.4 3.6"/>',
  pencil: '<path d="M4.5 19.5h4l10.2-10.2a2.1 2.1 0 0 0-3-3L5.5 16.5z"/><path d="M14.2 7.8l3 3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.9-3.6 3.6-5.6 6.5-5.6s5.6 2 6.5 5.6"/>',
  party: '<path d="M4.5 19.5l4.8-12.3 7.5 7.5z"/><path d="M14 4.5v2M18.5 6l-1.4 1.4M19.5 10h-2"/>',
  heart: '<path d="M12 19.5s-7-4.3-7-9.6a3.9 3.9 0 0 1 7-2.4 3.9 3.9 0 0 1 7 2.4c0 5.3-7 9.6-7 9.6z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  arrowRight: '<path d="M5 12h13M13 7l5 5-5 5"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8.5 7l1.4-2.6h4.2L15.5 7"/><circle cx="12" cy="13.5" r="3.4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10.5l4.6-2.6a.3.3 0 0 1 .4.3v7.6a.3.3 0 0 1-.4.3L16 13.5"/>',
  save: '<path d="M5.5 4h10.5l3 3v11.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5V5.5A1.5 1.5 0 0 1 6.5 4z"/><path d="M8.5 4v4.5h6V4"/><rect x="8.5" y="13" width="7" height="4.5" rx="1"/>',
  soundOn: '<path d="M4 9.5h3.4L12 5.6v12.8l-4.6-3.9H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a7.8 7.8 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9.5h3.4L12 5.6v12.8l-4.6-3.9H4z"/><path d="M16 9.8l4.4 4.4M20.4 9.8L16 14.2"/>',
  full: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  hand: '<path d="M8.2 13.2V7a1.5 1.5 0 0 1 3 0v4.6M11.2 11V5.5a1.5 1.5 0 0 1 3 0V11M14.2 11.2V7a1.5 1.5 0 0 1 3 0v6.8a6.2 6.2 0 0 1-6.2 6.2h-.4a6 6 0 0 1-4.8-2.4L4.2 15a1.6 1.6 0 0 1 2.4-2.1l1.6 1.4"/>',
  jump: '<path d="M12 16V5M7 10l5-5 5 5"/><path d="M6.5 20h11"/>',
  help: '<circle cx="12" cy="12" r="8.8"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7v.3"/><circle cx="12" cy="16.9" r=".9" fill="currentColor" stroke="none"/>',
  rotate: '<path d="M19.5 12.5a7.5 7.5 0 1 1-2.4-6"/><path d="M19.5 4.5v4h-4"/>',
  move: '<path d="M12 4v16M4 12h16M9.5 6.5L12 4l2.5 2.5M9.5 17.5L12 20l2.5-2.5M6.5 9.5L4 12l2.5 2.5M17.5 9.5L20 12l-2.5 2.5"/>',
  trash: '<path d="M4.5 7h15M10 4h4M6.5 7l.9 11.6A1.5 1.5 0 0 0 8.9 20h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10 11v5M14 11v5"/>',
  chat: '<path d="M6 5h12a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 17h-6.5L7.5 20v-3H6a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 6 5z"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.7-.7 1.7-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6h1.9a4.2 4.2 0 0 0 4.3-4.2c0-4-3.8-7.2-8.5-7.2z"/><circle cx="7.6" cy="11" r="1"/><circle cx="10" cy="7.3" r="1"/><circle cx="14.4" cy="7.3" r="1"/>',
  friends: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5"/><circle cx="16.5" cy="9.3" r="2.4"/><path d="M15.6 14.1c2.3-.3 4.2 1.2 4.9 4.4"/>',
  box: '<path d="M4 8.5l8-4 8 4v7.5l-8 4-8-4z"/><path d="M4 8.5l8 4 8-4M12 12.5V20"/>',
  sliders: '<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2.2"/><circle cx="9" cy="16.5" r="2.2"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  chevron: '<path d="M8 10l4 4 4-4"/>',
  home: '<path d="M4 11.5L12 4.5l8 7"/><path d="M6.2 9.8V19.5h11.6V9.8"/><path d="M10 19.5v-4.8h4v4.8"/>',
  book: '<path d="M6 4h11a1.5 1.5 0 0 1 1.5 1.5V20H7.5A2.5 2.5 0 0 1 5 17.5v-12A1.5 1.5 0 0 1 6.5 4"/><path d="M5 17.5A2.5 2.5 0 0 1 7.5 15h11"/>',
  compass: '<circle cx="12" cy="12" r="8.8"/><path d="M15.4 8.6l-2 5-4.8 1.8 2-5z"/>',
  reset: '<path d="M4.5 12.5a7.5 7.5 0 1 0 2.4-6"/><path d="M4.5 4.5v4h4"/>',
  clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.5V12l3 2"/>',
  news: '<path d="M4 10v4h3l8 4V6L7 10z"/><path d="M18 9.5a3 3 0 0 1 0 5"/><path d="M7 14l1 5h2"/>',
  download: '<path d="M12 4v11M7.5 10.5l4.5 4.5 4.5-4.5M5 20h14"/>',
  shirt: '<path d="M9 4.5L4.5 7l1.8 3.6 1.9-.9v9.8h7.6V9.7l1.9.9L19.5 7 15 4.5c-.5 1.2-1.7 2-3 2s-2.5-.8-3-2z"/>',
  bag: '<path d="M5.5 8.5h13l-1 11h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 12h16M12 4v16"/>',
  undo: '<path d="M9 13.5L4.5 9 9 4.5"/><path d="M4.5 9h9.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 13.5L19.5 9 15 4.5"/><path d="M19.5 9H10a5.5 5.5 0 0 0 0 11h3"/>',
  folder: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h4l2 2h7A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/>',
};

export function icon(name, cls = '') {
  const d = P[name];
  if (!d) return '';
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

// HTML에 <i data-icon="camera"></i> 처럼 적어 두면 그 자리에 아이콘을 넣어 줌
export function fillIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, el.className); });
}
