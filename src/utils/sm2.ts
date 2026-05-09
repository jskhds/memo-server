import { ICard } from '../models/Card';

/** 复习评分：0=不会 / 3=模糊 / 5=掌握 */
export type ReviewQuality = 0 | 3 | 5;

/** SM-2 计算结果（只包含需要更新的字段） */
export interface SM2Result {
  ease: number;
  interval: number;
  repetitions: number;
  nextReview: Date;
  status: 'again' | 'learning' | 'mastered';
}

/**
 * SM-2 间隔重复算法
 *
 * status 由本次 quality 直接决定，作为前端展示状态的来源：
 *   quality=0（不会）→ 'again'
 *   quality=3（模糊）→ 'learning'
 *   quality=5（掌握）→ 'mastered'
 *
 * interval 决定下次复习时间（与展示状态解耦）：
 *   quality=0：重置 repetitions=0, interval=1
 *   quality=3：repetitions+1，interval 缩短（× 0.7）
 *   quality=5：标准 SM-2，interval 按 ease 增长
 */
export function calculateSM2(
  card: Pick<ICard, 'ease' | 'interval' | 'repetitions'>,
  quality: ReviewQuality,
): SM2Result {
  let { ease, interval, repetitions } = card;

  const newEase = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  ease = Math.max(1.3, newEase);

  if (quality === 0) {
    repetitions = 0;
    interval = 1;
  } else if (quality === 3) {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 3;
    } else {
      interval = Math.max(1, Math.round(interval * ease * 0.7));
    }
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
  }

  const nextReview = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);

  const status: SM2Result['status'] =
    quality === 0 ? 'again' : quality === 3 ? 'learning' : 'mastered';

  return { ease, interval, repetitions, nextReview, status };
}
