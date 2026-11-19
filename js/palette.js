// 색감은 전부 여기 모아 둡니다. 분위기 참고 자료가 오면 이 파일만 고치면 됩니다.
export const PALETTE = {
  plotGrass: 0xa6d488,   // 마당 잔디
  plotSide: 0xa98463,    // 섬 옆면 흙
  wood: 0xb98a5e,
  woodDark: 0x8f6745,
  leaf: [0x8cc96b, 0x7dbd62, 0xa3d47c],
  pine: 0x6fae74,
  stone: 0xc8c3bb,
  stoneDark: 0xaaa39a,
  flower: [0xffb3c7, 0xfff1a6, 0xc9b8ff, 0xffffff, 0xffc9a3],
  metal: 0x6f7a80,
  bulb: 0xfff2c4,
  mailbox: 0x8fc4e8,
  flag: 0xffd166,
  parasol: 0xffb7b2,
  table: 0xe8d3b5,
  fire: 0xffa94d,
  cloud: 0xffffff,
  // 아바타
  skin: 0xffe0c7,
  hair: 0x7a5640,
  shirt: 0xbfe0f2,
  pants: 0x8fa7cf,
  shoes: 0x6b5a4e,
  cheek: 0xffb3b3,
  eye: 0x3a302a,
};

// 시간대별 하늘 (시각, 위 색, 아래 색, 햇빛 색, 햇빛 세기, 주변광 세기)
// 밤은 참고 이미지처럼 남보라 → 분홍보라 그라데이션
export const SKY_KEYS = [
  { t: 0,    top: 0x1c2170, bottom: 0x9a6fd0, sun: 0xb7b0ff, sunI: 0.5,  ambI: 0.75 },
  { t: 5,    top: 0x2a3a8a, bottom: 0xc79ad8, sun: 0xc8b8ff, sunI: 0.55, ambI: 0.8 },
  { t: 7,    top: 0x86b8ec, bottom: 0xffdccc, sun: 0xffe0bd, sunI: 1.8,  ambI: 1.15 },
  { t: 10,   top: 0x5aa8ee, bottom: 0xcfeafc, sun: 0xfff7ea, sunI: 2.4,  ambI: 1.35 },
  { t: 15,   top: 0x5aa8ee, bottom: 0xcfeafc, sun: 0xfff7ea, sunI: 2.4,  ambI: 1.35 },
  { t: 18.3, top: 0x7484d8, bottom: 0xffb898, sun: 0xffb07e, sunI: 1.6,  ambI: 1.0 },
  { t: 20,   top: 0x2d3285, bottom: 0xb27ad0, sun: 0xb7b0ff, sunI: 0.55, ambI: 0.8 },
  { t: 22,   top: 0x1c2170, bottom: 0x9a6fd0, sun: 0xb7b0ff, sunI: 0.5,  ambI: 0.75 },
  { t: 24,   top: 0x1c2170, bottom: 0x9a6fd0, sun: 0xb7b0ff, sunI: 0.5,  ambI: 0.75 },
];
