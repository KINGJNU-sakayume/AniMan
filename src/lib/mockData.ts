// src/lib/mockData.ts
export interface MediaNode {
  id: string;
  title?: string;
  number: number | string;
  startChapter: number;
  endChapter: number | null;
  duration?: number;
  cover_url?: string;  // M-01: TS2352 — volumes 배열에서 사용되는 필드 추가
}

export const oshiNoKoData = {
  series: {
    id: 'oshi-no-ko',
    title: '최애의 아이\n(推しの子)',
    description: '지방 도시에서 일하는 산부인과 의사 고로는 어느 날 그의 "최애" 아이돌 호시노 아이를 만나게 되는데... 연예계의 빛과 그림자를 다룬 이야기.',
    cover_url: 'https://wallpapers.com/images/featured/oshi-no-ko-l128i89n83u721ql.jpg',
    accent_color: '#FF1493' // 마젠타 핑크
  },
  
  episodes: [
    // --- 애니메이션 1기 (Season 1) ---
    { id: 'ep1', title: 'Mother and Children', number: 1, startChapter: 1, endChapter: 10, duration: 90 },
    { id: 'ep2', title: '세 번째 선택지', number: 2, startChapter: 11, endChapter: 13, duration: 24 },
    { id: 'ep3', title: '만화 원작 드라마', number: 3, startChapter: 14, endChapter: 16, duration: 24 },
    { id: 'ep4', title: '배우', number: 4, startChapter: 17, endChapter: 19, duration: 24 },
    { id: 'ep5', title: '연애 리얼리티 쇼', number: 5, startChapter: 20, endChapter: 21, duration: 24 },
    { id: 'ep6', title: '에고 서핑', number: 6, startChapter: 22, endChapter: 24, duration: 24 },
    { id: 'ep7', title: '버즈', number: 7, startChapter: 25, endChapter: 27, duration: 24 },
    { id: 'ep8', title: '처음', number: 8, startChapter: 28, endChapter: 30, duration: 24 },
    { id: 'ep9', title: 'B코마치', number: 9, startChapter: 31, endChapter: 32, duration: 24 },
    { id: 'ep10', title: '프레셔', number: 10, startChapter: 33, endChapter: 35, duration: 24 },
    { id: 'ep11', title: '아이돌', number: 11, startChapter: 36, endChapter: 40, duration: 24 },

    // --- 애니메이션 2기 (Season 2 - 도쿄 블레이드 편 등) ---
    { id: 'ep12', title: '도쿄 블레이드 (2기 1화)', number: 12, startChapter: 41, endChapter: 44, duration: 24 },
    { id: 'ep13', title: '전언 게임', number: 13, startChapter: 45, endChapter: 46, duration: 24 },
    { id: 'ep14', title: '리라이팅', number: 14, startChapter: 47, endChapter: 50, duration: 24 },
    { id: 'ep15', title: '감정 연기', number: 15, startChapter: 51, endChapter: 54, duration: 24 },
    { id: 'ep16', title: '개막', number: 16, startChapter: 55, endChapter: 58, duration: 24 },
    { id: 'ep17', title: '성장', number: 17, startChapter: 59, endChapter: 61, duration: 24 },
    { id: 'ep18', title: '태양', number: 18, startChapter: 62, endChapter: 65, duration: 24 },
    { id: 'ep19', title: '트리거', number: 19, startChapter: 66, endChapter: 68, duration: 24 },
    // * 참고: 2기 후반부에 원작 109화 등 선행 배치된 특수 케이스도 이런 식으로 추가 가능합니다.
  ] as MediaNode[],
  
  // src/lib/mockData.ts 내의 volumes 배열 부분을 이렇게 수정하세요
  volumes: [
    { id: 'vol1', number: 1, startChapter: 1, endChapter: 10, cover_url: 'https://i.namu.wiki/i/I7tsKKZrpu-_udlwyd9l8xU-aCo69ZDtFnGSuq_gUX2as_H5Gs7I_wRXpjgOTEOCC0CkmM3I3hkbJwwrZlmvdApTxuuB2YGtLGXWeB6iGbcp2IHnO5T0i2fIkFME7zZd24l2tFeWFxnbULctukOkcw.webp' },
    { id: 'vol2', number: 2, startChapter: 11, endChapter: 20, cover_url: 'https://i.namu.wiki/i/nyYNcBbIcXrLJnrJ0d4NB87zinXcTMJGyvmxbyKA2T4D2NGAEwAoZ7nREracsrIhdDj601O7rV1Cp7E9CQBBXe0O0nli8f-4VuZaH5nHlheyKUSlqutNIWX5MaSQMWsL-hep3PvAcZRtlNLKISuctA.webp' },
    { id: 'vol3', number: 3, startChapter: 21, endChapter: 30, cover_url: 'https://i.namu.wiki/i/RJl-3b2kHFU5l2LoN98sQNpz2dI6JQhK8-aE-GIFu64p_dTa1AwgO4a1o0jPytJkILxwKYt631yaqLeZcVLcyIeUDaKekD2g7s3kmoYdcjtW_FfZAAv9vwrAK2cERGifVmKINsouk1xGRldQcjacgA.webp' },
    { id: 'vol4', number: 4, startChapter: 31, endChapter: 40, cover_url: 'https://i.namu.wiki/i/7DsgrkvK3UVXK0Ss0UR5OM0_vDNbFcS2dNzh8MtLyRxqG-2SYnpnVqiTnf7kAdNNvM8ag3k-dEQBO3vdcq7jHbxyQQ0ylld4Pq7-fq6yKiN9hxw72cLkbXXHIuvDRB2RnQYgUEUF8OCVasvwFqlkKQ.webp' },
    { id: 'vol5', number: 5, startChapter: 41, endChapter: 50, cover_url: 'https://i.namu.wiki/i/JxCI3oxgHYQ6YqAzCQHkDtGUcpEIzCxB7blv0O-feVYhuIw9vy0SKVdVp5pMd24m9jctBtBXAFzZU1uoeDcz5IPGXk3pRA_MI4wKSgCeiyH-VNVyAewzrPM-xFLlIwdVNq8GneAJfsAG3mRRl2vq_A.webp' },
    { id: 'vol6', number: 6, startChapter: 51, endChapter: 60, cover_url: 'https://i.namu.wiki/i/ufOkgSDgCDsRXU5j2aQDlkD_d_5ZW7Vvul400nmbmQ8FzsQoHCekU8h14mDBkmjxJW_a2gmoksJV6r7H7r9kfCJWthENkupBPb_DGsywUb2fmUAIWo742VfO-Rt6d7Q00ugzPDsq-dNpVJ72qeQMyA.webp' },
    { id: 'vol7', number: 7, startChapter: 61, endChapter: 70, cover_url: 'https://i.namu.wiki/i/0ZHhH7ia2vlbyfiYezZE0EyJvT_MexeCVmNeEqOjpFrB_0OvV-_uYUomV7FTAxMLffKnctv2od4nCH8EIDPXjN4y3bCCl9YVbeSn1z0gap7UT1Vc4RkAjjd-0k_trX2pA_TBvcXkeGFu_kqUcIzong.webp' },
    { id: 'vol8', number: 8, startChapter: 71, endChapter: 80, cover_url: 'https://i.namu.wiki/i/-2CgVBeYH40CMXSZbhhw0EGD-oU0ffzV8WWrKNxN-RMzZLTHY2xRAdJjKLc7wrJXDLb-itex8Np96iL0qd7NSy3bPf_WNCOx9GGhTKV5vUkfxwdj2xuR-pNL8PQ3-wrrqrzo765ol1TgCCNMy3Ce0g.webp' },
  ] as MediaNode[]
};

export const frierenData = {
  series: { 
    id: 'frieren',
    title: "장송의 프리렌",
    description: '마왕을 물리친 용사 일행 중, 천 년 이상 사는 엘프 마법사 프리렌이 수명이 짧은 인간 동료들의 죽음을 겪으며, 뒤늦게 인간을 이해하고 알아가기 위해 떠나는 여정을 그린 후일담 판타지',
    accent_color: '#03acb1',
    banner_image_url: 'https://occ-0-8407-2219.1.nflxso.net/dnm/api/v6/6AYY37jfdO6hpXcMjf9Yu5cnmO0/AAAABSSdSBMo_cJuIznPoxW1gKQlmrcuEYUmsLqHLZ5mCjS0Df5TEGvvMxh_DqUL0F7X1aDUEBDiYYPct6-OWD54Fsy-zBhzXK7Pd0F0.jpg?r=e24'
  },
  seasons: [
    { name: 'SEASON 1 (Ep 1~28)', startChapter: 1, endChapter: 60 },
    { name: 'SEASON 2 (TBA)', startChapter: 61, endChapter: 80 }
  ],
  episodes: [
    { id: 'f_e1', title: '모험의 끝', number: 1, startChapter: 1, endChapter: 2, duration: 24 },
    { id: 'f_e2', title: '마법은 거짓말을 하지 않는다', number: 2, startChapter: 2, endChapter: 3, duration: 24 },
    { id: 'f_e3', title: '살인 마법', number: 3, startChapter: 4, endChapter: 5, duration: 24 },
    { id: 'f_e4', title: '영혼이 잠드는 곳', number: 4, startChapter: 6, endChapter: 8, duration: 24 },
    { id: 'f_e5', title: '사자의 환영', number: 5, startChapter: 8, endChapter: 10, duration: 24 },
    { id: 'f_e6', title: '마을의 영웅', number: 6, startChapter: 11, endChapter: 12, duration: 24 },
    // 7화~11화는 '단죄의 아우라 편'으로 합쳐서 표현
    { id: 'f_e7_11', title: '단죄의 아우라 편 (Ep 7~11)', number: '7-11', startChapter: 13, endChapter: 23, duration: 120 },
    // 12화~17화는 자인의 합류와 이별
    { id: 'f_e12_17', title: '자인 편 (Ep 12~17)', number: '12-17', startChapter: 25, endChapter: 36, duration: 144 },
    // 18화~28화는 1급 마법사 시험 편
    { id: 'f_e18_28', title: '1급 마법사 시험 편 (Ep 18~28)', number: '18-28', startChapter: 37, endChapter: 60, duration: 264 },
  ],
  volumes: [
    { id: 'f_v1', number: 1, startChapter: 1, endChapter: 7, cover_url: 'https://i.namu.wiki/i/jdE-3_leNyd3g8bWaaehVGbeP9B4D5DWJmJu3Kpz4_Xl-kQEXPddeAXwUeE1Bkzxdqy7zI_x2UAA1koIapddbVc8OsX--Bppjpc5QG9a2gep0Q4yHGs0Gywg1Hj8EE-keTTuxofTEBsuUpbCGtDiqw.webp' },
    { id: 'f_v2', number: 2, startChapter: 8, endChapter: 17, cover_url: 'https://i.namu.wiki/i/nSVklo_VSvhpGGKp1TOpuENMu_LaCP0HoZOUxtD_YhROxePDfA6qn067LgbPnqSF5LSyPzp_wRshUNj-UqEV_StzZTVfc_dVOxuTzPsxbZs9_6Kda5TEKu7pj_rNDnLKMmucZtAKLXEMC8kNpDhfaA.webp' },
    { id: 'f_v3', number: 3, startChapter: 18, endChapter: 27, cover_url: 'https://i.namu.wiki/i/LHxoOzwysFDVybH5P3UpDJyhFS7I_PKQf6QG615PQg5jpCfFacUnEiTBW1LvqsFtZgvPj6OLBeQlmhg1sG8P0sEGFGaF6hUOOopT0axv66_91g--SUSVMw0ipbhY7B5eLEgT0vkNAwY80YC8zs_96A.webp' },
    { id: 'f_v4', number: 4, startChapter: 28, endChapter: 37, cover_url: 'https://i.namu.wiki/i/kwfVa5vTHBhi1Xl0S9o__z91tV2Ds6FBGfQbTK-oeV03JDHaH3VpFoBeKVGZVZW9IQel2SM_zuUTiTlbhLYI298bsixW91rq4xgutWjCET-L32kxLUY-wTyZ1see4VmBWDMfu41zf16NKlgyitAVLg.webp' },
    { id: 'f_v5', number: 5, startChapter: 38, endChapter: 47, cover_url: 'https://i.namu.wiki/i/EG7U22BYioe5_3S0wGH8NaaNlPYGDmIhQtW5zbxxatrREZ4e6nJ5_DMsZaFiiJ1TWx5noaSukcsqIa6fVd-lTPC4ErwHM90MY1Vn4RHYy1nLd77Io-xPSipJ3PUjVVaQGs5aPHW7bj71rfhrwcMV0w.webp' },
    { id: 'f_v6', number: 6, startChapter: 48, endChapter: 57, cover_url: 'https://i.namu.wiki/i/F6F0XMhHjAE9vdfWlOlcvI0qX0NdAZtJCAVgHksEav749T0kiLHH8vmGC1GShxVolUF44g2wBEsOCVgvR6T0szFQvew1jHi_gNXbYS5BrcHnLsdRkTfNx4z5cStdNF76kpT3NliES6mmDkPtU7VbZw.webp' },
    { id: 'f_v7', number: 7, startChapter: 58, endChapter: 67, cover_url: 'https://i.namu.wiki/i/Wfg211VGmOrnzZhePHgutNYleZCtFO0if2HCr-HohOAIc8ucJ3n1XL372Z7-aWFQ7Cdqc5xTWH8TDsWCraOP7vt31xfNXqVHiD4YWqs-trX4-qgLI3Nq2nLQIMFB8b0v5pxNZnegg6ob_gFH7Ugtog.webp' },
  ]
};

export const bocchiData = {
  series: { 
    id: 'bocchi_the_rock',
    title: "봇치 더 록!",
    description: '극심한 낯가림으로 "외톨이(봇치)"였던 고등학생 고토 히토리가 결속 밴드에 합류하게 되면서, 개성 강한 동료들과 함께 음악 활동을 통해 성장해 나가는 과정을 그린 음악/일상물',
    accent_color: '#ff78ae',
    banner_image_url: 'https://wallpapers.com/images/featured/bocchi-the-rock-finiws4zqzxwyo35.jpg'
  },
  seasons: [
    { name: 'SEASON 1', startChapter: 1, endChapter: 21 },
    { name: 'SEASON 2 (TBA)', startChapter: 22, endChapter: 40 }
  ],
  episodes: [
    { id: 'b_e1', title: '굴러가는 바위, 네게 아침이 내린다', number: 1, startChapter: 1, endChapter: 1, duration: 24 },
    { id: 'b_e2', title: '글쎄 내일 만나', number: 2, startChapter: 2, endChapter: 2, duration: 24 },
    { id: 'b_e3', title: '바보라도 갈 수 있어', number: 3, startChapter: 3, endChapter: 3, duration: 24 },
    { id: 'b_e4', title: '점핑 걸(들)', number: 4, startChapter: 4, endChapter: 5, duration: 24 },
    { id: 'b_e5', title: '날지 못하는 물고기', number: 5, startChapter: 6, endChapter: 6, duration: 24 },
    { id: 'b_e6', title: '팔일째의 밤', number: 6, startChapter: 7, endChapter: 8, duration: 24 },
    { id: 'b_e7', title: '너의 집까지', number: 7, startChapter: 9, endChapter: 11, duration: 24 },
    { id: 'b_e8', title: '결속 밴드', number: 8, startChapter: 12, endChapter: 12, duration: 24 },
    { id: 'b_e9', title: '에노시마 에스카', number: 9, startChapter: 13, endChapter: 14, duration: 24 },
    { id: 'b_e10', title: '방과 후 포스', number: 10, startChapter: 15, endChapter: 16, duration: 24 },
    { id: 'b_e11', title: '빛나는 별자리', number: 11, startChapter: 17, endChapter: 18, duration: 24 },
    { id: 'b_e12', title: '네게 아침이 내린다', number: 12, startChapter: 19, endChapter: 21, duration: 24 },
  ],
  volumes: [
    { id: 'b_v1', number: 1, startChapter: 1, endChapter: 12, cover_url: 'https://i.namu.wiki/i/9f9nX7HqCvk_NIwDJ4fBjiSE5Ilq70SJa8FQXIIjgucTKWAITg_Lqp19vWeG92aJkHJys9Ab4b6gOhiPBg9V-fqS6l5BDoVYZ0kmJP_BvunqGduv66J8CLoKpxOSDo6EHxqx1wCz32Yk1ko_xnrUaQ.webp' },
    { id: 'b_v2', number: 2, startChapter: 13, endChapter: 24, cover_url: 'https://i.namu.wiki/i/-hSX43-_hiAdyQcoG_rDQbb-vXYDkYIb0HryTw6nDtLrZPABhh-3sSihjol8awLMRk3jHmygn6t07FyiJuOhtHqhGKoQSzfYzJhDp16mHTjyFJfIaM1sMUqOvaqi5wh-Z8-1o8dCWygWVOrrkZxqMg.webp' },
    { id: 'b_v3', number: 3, startChapter: 25, endChapter: 36, cover_url: 'https://i.namu.wiki/i/eG7FI7ffKj9-zxb3v2vNsU2gaRf-an7sIxI2Xavmcw5QK8PYNipz04K7IEJqFjDQs2v_iCcj8zl0DBWxxn0bQxw1CwSnbHeEievkoWqEKhzH07BYr5Q_9Ppis_ddJYmEbBiZ-UsxLxXSXPqcdlDraw.webp' },
    { id: 'b_v4', number: 4, startChapter: 37, endChapter: 48, cover_url: 'https://i.namu.wiki/i/vT-gLbM5NQiltRZbtW5B_0oHhYwbwgPNrs2mTNMzbL_52m6O27LskatKJyW5ht5ApIM5P6-9GpQts03Wfem-bwEBAetMUgQarEPoq5mlb72IG2igmr35YgJwlWbg4pao3adzY7hUlb1x7c7IA-CSOg.webp' },
    { id: 'b_v5', number: 5, startChapter: 49, endChapter: 60, cover_url: 'https://i.namu.wiki/i/GG0AQ9LsF-FC_JaVQlND-1oQB6IyEvKoQVaAfuX304P7Hkycqw3oHYkjVsG0lU0YS5gX907ZpZcd3npsi9Q795TfTe9HU-GUakLfYiKDKsSQ-yLS4Yd0jCpx47mIdGzEtwnX3DwBau5EQtlkF2Gezw.webp' },
    { id: 'b_v6', number: 6, startChapter: 61, endChapter: 72, cover_url: 'https://i.namu.wiki/i/KMB4ObWHmlC91-XZsu50HM4KApZqNqduZMtJmwoFcPiPiXnxnYng2P9xFu9-SB1c7jnfpdhBOrQsmGaALA-ZOPzNVMW9F_y3oQA3_w7NpHoJzflEbBlLirNo2OVWgSVQ2uuzvASWAnjEIMlPbmiJfw.webp' },
  ]
};

export const jujutsuKaisenData = {
  series: { 
    id: 'jujutsu_kaisen',
    title: "주술회전",
    description: '경이로운 신체 능력을 가진 고등학생 이타도리 유지가 저주의 왕 양면 스쿠나의 손가락을 먹게 되면서 벌어지는 이야기. 저주를 퇴치하는 주술사들의 사투를 그린 다크 판타지',
    accent_color: '#166FBB',
    banner_image_url: 'https://images.thedirect.com/media/article_full/kaisn.jpg' 
  },
  seasons: [
    { name: 'SEASON 1', startChapter: 1, endChapter: 63 },
    { name: 'SEASON 2', startChapter: 64, endChapter: 136 },
    { name: 'SEASON 3 (TBA)', startChapter: 137, endChapter: null }
  ],
  episodes: [
    // SEASON 1
    { id: 'jk_e1', title: '양면 스쿠나', number: 1, startChapter: 1, endChapter: 1, duration: 24 },
    { id: 'jk_e2', title: '자신을 위하여', number: 2, startChapter: 2, endChapter: 2, duration: 24 },
    { id: 'jk_e3', title: '철골 딸기', number: 3, startChapter: 3, endChapter: 3, duration: 24 },
    { id: 'jk_e4', title: '주태대천', number: 4, startChapter: 4, endChapter: 5, duration: 24 },
    { id: 'jk_e5', title: '주태대천 -2-', number: 5, startChapter: 6, endChapter: 8, duration: 24 },
    { id: 'jk_e6', title: '비 온 뒤에 굳어진다', number: 6, startChapter: 9, endChapter: 11, duration: 24 },
    { id: 'jk_e7', title: '급습', number: 7, startChapter: 12, endChapter: 15, duration: 24 },
    { id: 'jk_e8', title: '지루함', number: 8, startChapter: 16, endChapter: 18, duration: 24 },
    { id: 'jk_e9', title: '유어와 역벌', number: 9, startChapter: 19, endChapter: 21, duration: 24 },
    { id: 'jk_e10', title: '무위전변', number: 10, startChapter: 22, endChapter: 23, duration: 24 },
    { id: 'jk_e11', title: '고지식', number: 11, startChapter: 24, endChapter: 26, duration: 24 },
    { id: 'jk_e12', title: '네게로', number: 12, startChapter: 27, endChapter: 29, duration: 24 },
    { id: 'jk_e13', title: '내일의 너에게', number: 13, startChapter: 30, endChapter: 31, duration: 24 },
    { id: 'jk_e14', title: '교토 자매 학교 교류회 -단체전 0-', number: 14, startChapter: 32, endChapter: 33, duration: 24 },
    { id: 'jk_e15', title: '교토 자매 학교 교류회 -단체전 1-', number: 15, startChapter: 34, endChapter: 36, duration: 24 },
    { id: 'jk_e16', title: '교토 자매 학교 교류회 -단체전 2-', number: 16, startChapter: 37, endChapter: 40, duration: 24 },
    { id: 'jk_e17', title: '교토 자매 학교 교류회 -단체전 3-', number: 17, startChapter: 40, endChapter: 42, duration: 24 },
    { id: 'jk_e18', title: '현자', number: 18, startChapter: 43, endChapter: 45, duration: 24 },
    { id: 'jk_e19', title: '흑섬', number: 19, startChapter: 46, endChapter: 49, duration: 24 },
    { id: 'jk_e20', title: '규격 외', number: 20, startChapter: 50, endChapter: 52, duration: 24 },
    { id: 'jk_e21', title: '주술 코시엔', number: 21, startChapter: 53, endChapter: 54, duration: 24 },
    { id: 'jk_e22', title: '기수뇌동', number: 22, startChapter: 55, endChapter: 56, duration: 24 },
    { id: 'jk_e23', title: '기수뇌동 -2-', number: 23, startChapter: 57, endChapter: 59, duration: 24 },
    { id: 'jk_e24', title: '공범', number: 24, startChapter: 60, endChapter: 63, duration: 24 },

    // SEASON 2 (회옥·옥절 & 시부야 사변)
    { id: 'jk_e25', title: '회옥', number: 25, startChapter: 65, endChapter: 66, duration: 24 },
    { id: 'jk_e26', title: '회옥 -2-', number: 26, startChapter: 67, endChapter: 69, duration: 24 },
    { id: 'jk_e27', title: '회옥 -3-', number: 27, startChapter: 70, endChapter: 72, duration: 24 },
    { id: 'jk_e28', title: '회옥 -4-', number: 28, startChapter: 73, endChapter: 75, duration: 24 },
    { id: 'jk_e29', title: '옥절', number: 29, startChapter: 76, endChapter: 78, duration: 24 },
    { id: 'jk_e30', title: '그런 거잖아', number: 30, startChapter: 64, endChapter: 80, duration: 24 },
    { id: 'jk_e31', title: '이브 축제', number: 31, startChapter: 81, endChapter: 82, duration: 24 },
    { id: 'jk_e32', title: '시부야 사변', number: 32, startChapter: 83, endChapter: 87, duration: 24 },
    { id: 'jk_e33', title: '개문', number: 33, startChapter: 88, endChapter: 90, duration: 24 },
    { id: 'jk_e34', title: '가담', number: 34, startChapter: 91, endChapter: 93, duration: 24 },
    { id: 'jk_e35', title: '강령', number: 35, startChapter: 94, endChapter: 97, duration: 24 },
    { id: 'jk_e36', title: '둔도', number: 36, startChapter: 98, endChapter: 101, duration: 24 },
    { id: 'jk_e37', title: '적린', number: 37, startChapter: 102, endChapter: 106, duration: 24 },
    { id: 'jk_e38', title: '유성', number: 38, startChapter: 107, endChapter: 110, duration: 24 },
    { id: 'jk_e39', title: '동요', number: 39, startChapter: 111, endChapter: 114, duration: 24 },
    { id: 'jk_e40', title: '살해의 연향', number: 40, startChapter: 115, endChapter: 116, duration: 24 },
    { id: 'jk_e41', title: '벽력 -2-', number: 41, startChapter: 117, endChapter: 119, duration: 24 },
    { id: 'jk_e42', title: '이리하여 이르게 됨', number: 42, startChapter: 120, endChapter: 121, duration: 24 },
    { id: 'jk_e43', title: '이리하여 이르게 됨 -2-', number: 43, startChapter: 122, endChapter: 125, duration: 24 },
    { id: 'jk_e44', title: '시부야 사변 -이비-', number: 44, startChapter: 126, endChapter: 127, duration: 24 },
    { id: 'jk_e45', title: '변신', number: 45, startChapter: 128, endChapter: 131, duration: 24 },
    { id: 'jk_e46', title: '변신 -2-', number: 46, startChapter: 132, endChapter: 134, duration: 24 },
    { id: 'jk_e47', title: '시부야 사변 -폐문-', number: 47, startChapter: 135, endChapter: 136, duration: 24 }
  ],
  volumes: [
    { id: 'jk_v1', number: 1, startChapter: 1, endChapter: 7, cover_url: 'https://i.namu.wiki/i/Fb4jk-NhkrYlopJOhWI-iee9P3-UVtHemEvvcGOQw-EUmRDLc10epCbrNMud07hSk4nlL0OopbziPrmq2SNnJ3iJXuvSyhKlWUcgT8WaE22Gv4OLTdLSfoW8BAqwUB4h2D-nXiWow2UgiHalM_0s7w.webp' },
    { id: 'jk_v2', number: 2, startChapter: 8, endChapter: 16, cover_url: 'https://i.namu.wiki/i/zn-Q-XyuvYDnpwS_2Uqz-tAHPMeVqPOv3SdH9wPMOeAjGrNAZ4C8GHAxaluXFe2mV7QVE_oCI2LDb_akf305Sy8BpMRtXJ0cgmBnTnDE15hG01aYmsNzKHqc6RGfT0s8bUgpkONcmjuMl-27FBQzdw.webp' },
    { id: 'jk_v3', number: 3, startChapter: 17, endChapter: 25, cover_url: 'https://i.namu.wiki/i/QbXFE8D8-TU1NXU_MY3EtYPqCtw4H3ZUUYbuzMTKRo1E39Wp-pcrj4dM-hfUgCMJ_eV7_V2lkDLVbacKNff7AAKZ8sfHJ4Cmb199HD6V_A31FCCvp7mth6MQdFx9HgNouJvnF4_axmxyMilYb95O2A.webp' },
    { id: 'jk_v4', number: 4, startChapter: 26, endChapter: 34, cover_url: 'https://i.namu.wiki/i/bPACZ_Ih76qr6-MlTMBK_5fkenzdXcCYoyZPSsDXFSShOWPiqwzuevYyH4kQ3D0q5omz58yQLFtWF5IfurN8R7w64hR2lcVBRELY-4XZi78NAEofpaalPwZhtG85UfWpGHP5a8LCtqr0g_75UzUE-A.webp' },
    { id: 'jk_v5', number: 5, startChapter: 35, endChapter: 43, cover_url: '' },
    { id: 'jk_v6', number: 6, startChapter: 44, endChapter: 52, cover_url: '' },
    { id: 'jk_v7', number: 7, startChapter: 53, endChapter: 61, cover_url: '' },
    { id: 'jk_v8', number: 8, startChapter: 62, endChapter: 70, cover_url: '' },
    { id: 'jk_v9', number: 9, startChapter: 71, endChapter: 79, cover_url: '' },
    { id: 'jk_v10', number: 10, startChapter: 80, endChapter: 88, cover_url: '' },
    { id: 'jk_v11', number: 11, startChapter: 89, endChapter: 97, cover_url: '' },
    { id: 'jk_v12', number: 12, startChapter: 98, endChapter: 106, cover_url: '' },
    { id: 'jk_v13', number: 13, startChapter: 107, endChapter: 115, cover_url: '' },
    { id: 'jk_v14', number: 14, startChapter: 116, endChapter: 124, cover_url: '' },
    { id: 'jk_v15', number: 15, startChapter: 125, endChapter: 133, cover_url: '' },
    { id: 'jk_v16', number: 16, startChapter: 134, endChapter: 142, cover_url: '' }
  ]
};

export const yofukashiData = {
  series: { 
    id: 'call_of_the_night',
    title: "철야의 노래",
    description: '불면증을 겪는 중학생 야모리 코우가 밤거리에서 아름다운 흡혈귀 나나쿠사 나즈나를 만나며 벌어지는 특별한 밤의 이야기.',
    accent_color: '#4b0082',
    banner_image_url: 'https://occ-0-8407-2219.1.nflxso.net/dnm/api/v6/6AYY37jfdO6hpXcMjf9Yu5cnmO0/AAAABa8ua_jL1KgK61Pyb34wxjR_-ruD5kUTL0dup8mr51-0b2z4OiqDyRXCjBJOEXVhOECKTAJ_CmE2t6wS_MlTzgLoeGZjb9h7TtMi.jpg?r=9e8' 
  },
  seasons: [
    { name: 'SEASON 1', startChapter: 1, endChapter: 46 },
    { name: 'SEASON 2', startChapter: 47, endChapter: 94 }
  ],
  episodes: [
    // SEASON 1 (1~13화)
    { id: 'yn_e1', title: '나이트 플라이트', number: 1, startChapter: 1, endChapter: 2, duration: 24 },
    { id: 'yn_e2', title: '라인 아이디 알려줄래?', number: 2, startChapter: 3, endChapter: 5, duration: 24 },
    { id: 'yn_e3', title: '많이 나왔네', number: 3, startChapter: 6, endChapter: 9, duration: 24 },
    { id: 'yn_e4', title: '좁지 않아?', number: 4, startChapter: 10, endChapter: 13, duration: 24 },
    { id: 'yn_e5', title: '곤란한데', number: 5, startChapter: 14, endChapter: 17, duration: 24 },
    { id: 'yn_e6', title: '더 즐거운 걸 찾자고', number: 6, startChapter: 18, endChapter: 21, duration: 24 },
    { id: 'yn_e7', title: '권속(피)을 만들래?', number: 7, startChapter: 22, endChapter: 25, duration: 24 },
    { id: 'yn_e8', title: '모두 똑같아', number: 8, startChapter: 26, endChapter: 30, duration: 24 },
    { id: 'yn_e9', title: '치사해', number: 9, startChapter: 31, endChapter: 34, duration: 24 },
    { id: 'yn_e10', title: '도둑 촬영인걸', number: 10, startChapter: 35, endChapter: 37, duration: 24 },
    { id: 'yn_e11', title: '흡혈귀라는 거 알고 있어?', number: 11, startChapter: 38, endChapter: 41, duration: 24 },
    { id: 'yn_e12', title: '우리 부모님도 이랬을까?', number: 12, startChapter: 42, endChapter: 44, duration: 24 },
    { id: 'yn_e13', title: '철야의 노래', number: 13, startChapter: 45, endChapter: 46, duration: 24 },

    // SEASON 2 (14~26화)
    { id: 'yn_e14', title: '흡혈귀가 되는 법', number: 14, startChapter: 47, endChapter: 50, duration: 24 },
    { id: 'yn_e15', title: '메이드 카페에 가자', number: 15, startChapter: 51, endChapter: 53, duration: 24 },
    { id: 'yn_e16', title: '아자미', number: 16, startChapter: 54, endChapter: 56, duration: 24 },
    { id: 'yn_e17', title: '거짓말은 아니지?', number: 17, startChapter: 57, endChapter: 60, duration: 24 },
    { id: 'yn_e18', title: '오해하지 마', number: 18, startChapter: 61, endChapter: 64, duration: 24 },
    { id: 'yn_e19', title: '나즈나의 과거', number: 19, startChapter: 65, endChapter: 68, duration: 24 },
    { id: 'yn_e20', title: '탐정', number: 20, startChapter: 69, endChapter: 72, duration: 24 },
    { id: 'yn_e21', title: '친구잖아', number: 21, startChapter: 73, endChapter: 76, duration: 24 },
    { id: 'yn_e22', title: '밤을 달리는 법', number: 22, startChapter: 77, endChapter: 80, duration: 24 },
    { id: 'yn_e23', title: '너는 누구야', number: 23, startChapter: 81, endChapter: 84, duration: 24 },
    { id: 'yn_e24', title: '작별', number: 24, startChapter: 85, endChapter: 88, duration: 24 },
    { id: 'yn_e25', title: '그것이 사랑인가', number: 25, startChapter: 89, endChapter: 91, duration: 24 },
    { id: 'yn_e26', title: '안녕, 다시 밤에', number: 26, startChapter: 92, endChapter: 94, duration: 24 }
  ],
  volumes: [
    { id: 'yn_v1', number: 1, startChapter: 1, endChapter: 9, cover_url: 'https://i.namu.wiki/i/ypBL9OpbTdgv46h3z141BxuASs7WL75uL5sITNZLTWKSyLf8PUO14IniaykExqzme-1K8Snrg0NArmadW0KfLXGOZNKJj7chU51LpIl3_YB2TqNHEfJCx0r-fC2qRc1FGKbQ7VPVONxyie7hFH72eg.webp' },
    { id: 'yn_v2', number: 2, startChapter: 10, endChapter: 19, cover_url: 'https://i.namu.wiki/i/S0r4jt6g_hroK9oFwzC30ry0Nn7ejDRIsJklFZtwuBgJKxUdfoNlC6NGizZlaD5wq24uEQ_bMhluIAmH7palHTXWvjlqwRv7MRRRA9ZaZg3eTuB71OPR4Tzep7k0gM0JzJyQg2xEE1JMWADZLxPqFg.webp' },
    { id: 'yn_v3', number: 3, startChapter: 20, endChapter: 29, cover_url: 'https://i.namu.wiki/i/lPWV8wKWy3hJNRyc_q-WHbawQgJX-1i6FjAil92y6cv7yJH8w_WFpxF-EUP9ULE1kZLtLdq7sgD6RnJ29F5LswFzRuhT6Qy5InQSOgVJWPcrWXwQBBOskKW-1HomKBvZ7Kfjt9ABx3z-yg0qsQ-Gyw.webp' },
    { id: 'yn_v4', number: 4, startChapter: 30, endChapter: 39, cover_url: 'https://i.namu.wiki/i/ZjkwPcoglRHaFZmynuX-vCHBui7njPqIlCvQgcuPLCRxFKrJyCzymZyNhQXHkbGZaLjJwEkTt8BQlVA_NHR8NK6ClSTlpbrclraDSVq3Q-jJu-39UYMBc1M8QLWkBD37fYEA2bfGHll3hAGLGiBCrg.webp' },
    { id: 'yn_v5', number: 5, startChapter: 40, endChapter: 49, cover_url: 'https://i.namu.wiki/i/5N-m0T1bqaCGymEC94Q_p_WMLJDohu9SRpTPOEuJO2PjEf_pAtZVd0BkNbe5v6kQUY5pWDyPAnn_0IWCbqApZJBzxzZ6S76Dv5Ak9-Dn6A4K3MQWDS-IP6QxWZyVEFQojkjApOw3jsJr1C74DnsfZQ.webp' },
    { id: 'yn_v6', number: 6, startChapter: 50, endChapter: 59, cover_url: 'https://i.namu.wiki/i/4JJ-3X_9HIobTod1biWTvWW-KFqC0BuBwO_Dcskcy0AJHAKrTkEX25OGqZOCJiog9V24bRK5KHip49770WefZbhKo3uVQqHuuqU-U439tGCOf6KJjReIOfuE-HjFfKEteiuVY9mkLnSrUug0GM_Xfw.webp' },
    { id: 'yn_v7', number: 7, startChapter: 60, endChapter: 69, cover_url: '' },
    { id: 'yn_v8', number: 8, startChapter: 70, endChapter: 79, cover_url: '' },
    { id: 'yn_v9', number: 9, startChapter: 80, endChapter: 89, cover_url: '' },
    { id: 'yn_v10', number: 10, startChapter: 90, endChapter: 99, cover_url: '' },
    { id: 'yn_v11', number: 11, startChapter: 100, endChapter: 109, cover_url: '' },
    { id: 'yn_v12', number: 12, startChapter: 110, endChapter: 119, cover_url: '' },
    { id: 'yn_v13', number: 13, startChapter: 120, endChapter: 129, cover_url: '' }
  ]
};

// 3. 작품 선택을 위한 통합 객체 내보내기 (I-01: 현재 앱에서 미사용, 참고용으로만 유지)
export const allAnimeData: Record<string, unknown> = {
  oshinoko: oshiNoKoData,
  frieren: frierenData,
  bocchi: bocchiData,
  jujutsukaisen: jujutsuKaisenData,
  yofukashi: yofukashiData,
};