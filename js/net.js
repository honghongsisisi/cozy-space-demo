// 친구와 같은 섬에 있기 위한 '연결 통로'.
// 원리: 같은 섬에 들어온 사람들은 모두 같은 '방송 채널'에 귀를 기울이고 있어요.
// 누가 움직이거나 말하면 짧은 쪽지를 채널에 띄우고, 다른 사람들 화면이 그 쪽지를 받아 그대로 보여 줘요.
// 서버(Supabase)는 쪽지를 전달만 하고, 섬 꾸밈은 섬 주인 화면이 손님에게 직접 보내 줍니다.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=0.34';

// 주소 끝에 ?localtest=1 을 붙이면 서버 없이 같은 브라우저의 두 창끼리만 연결 (개발 시험용)
const LOCAL_TEST = new URLSearchParams(location.search).has('localtest');

export function netConfigured() {
  return LOCAL_TEST || !!(SUPABASE_URL && SUPABASE_KEY && window.supabase);
}

// 서버 채널 (Supabase Realtime의 broadcast 기능만 사용)
class SupabaseLink {
  constructor(roomId, onMsg, onStatus) {
    if (!SupabaseLink.client) SupabaseLink.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    this.ch = SupabaseLink.client.channel(`isle-${roomId}`, { config: { broadcast: { self: false } } });
    this.ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
    this.ch.subscribe((status) => onStatus(status === 'SUBSCRIBED' ? 'on' : status === 'CLOSED' ? 'off' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'error' : 'wait'));
  }
  send(msg) { this.ch.send({ type: 'broadcast', event: 'm', payload: msg }); }
  close() { try { SupabaseLink.client.removeChannel(this.ch); } catch (e) { /* 무시 */ } }
}

// 시험용: 같은 브라우저 안의 창끼리 주고받기
class LocalLink {
  constructor(roomId, onMsg, onStatus) {
    this.bc = new BroadcastChannel(`isle-${roomId}`);
    this.bc.onmessage = (e) => onMsg(e.data);
    setTimeout(() => onStatus('on'), 50);
  }
  send(msg) { this.bc.postMessage(msg); }
  close() { this.bc.close(); }
}

export function openLink(roomId, onMsg, onStatus) {
  return LOCAL_TEST ? new LocalLink(roomId, onMsg, onStatus) : new SupabaseLink(roomId, onMsg, onStatus);
}
