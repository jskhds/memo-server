import { ICard } from '../models/Card';

/** 复习评分：0=不会 / 3=模糊 / 5=掌握 */
export type ReviewQuality = 0 | 3 | 5;

/** SM-2 计算结果（只包含需要更新的字段） */
export interface SM2Result {
  ease: number;
  interval: number;
  repetitions: number;
  nextReview: Date;
  status: 'new' | 'learning' | 'review';
}

/**
 * SM-2 间隔重复算法（从前端迁移至后端，保证数据一致性）
 *
 * 状态判定：
 *   repetitions === 0        → 'new'
 *   interval <= 7            → 'learning'
 *   interval > 7             → 'review'
 *
 * 评分逻辑：
 *   quality=0（不会）：重置 repetitions=0, interval=1
 *   quality=3（模糊）：repetitions+1，interval 缩短（× 0.7）
 *   quality=5（掌握）：标准 SM-2，interval 按 ease 增长
 *
 * @param card  - 当前卡片 SM-2 数据
 * @param quality - 本次评分
 * @returns 更新后的 SM-2 字段
 */
export function calculateSM2(card: Pick<ICard, 'ease' | 'interval' | 'repetitions'>, quality: ReviewQuality): SM2Result {
  let { ease, interval, repetitions } = card;

  // 更新 ease factor（SM-2 公式）
  // ease' = ease + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  const newEase = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  ease = Math.max(1.3, newEase); // ease 下限 1.3

  if (quality === 0) {
    // 不会：重置
    repetitions = 0;
    interval = 1;
  } else if (quality === 3) {
    // 模糊：增加复习次数，缩短间隔
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 3;
    } else {
      interval = Math.max(1, Math.round(interval * ease * 0.7));
    }
  } else {
    // 掌握（quality === 5）：标准 SM-2
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
  }

  // 计算下次复习时间
  const nextReview = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);

  // 判定存储 status
  let status: SM2Result['status'];
  if (repetitions === 0) {
    status = 'new';
  } else if (interval <= 7) {
    status = 'learning';
  } else {
    status = 'review';
  }

  return { ease, interval, repetitions, nextReview, status };
}
