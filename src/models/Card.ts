import mongoose, { Document, Schema, Types } from 'mongoose';

/** 卡片状态：new=新学 / learning=学习中 / review=已复习 */
export type CardStatus = 'new' | 'learning' | 'review';

/** Card 文档接口 */
export interface ICard extends Document {
  deckId: Types.ObjectId;
  userId: Types.ObjectId;
  front: string;
  back: string;
  ease: number;
  interval: number;
  repetitions: number;
  nextReview: Date;
  status: CardStatus;
  reading?: string;
  romaji?: string;
  pitch?: number;
  meaning?: string;
  example?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CardSchema = new Schema<ICard>(
  {
    deckId: {
      type: Schema.Types.ObjectId,
      ref: 'Deck',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    front: {
      type: String,
      required: true,
      trim: true,
    },
    back: {
      type: String,
      required: true,
      trim: true,
    },
    ease: {
      type: Number,
      default: 2.5,
    },
    interval: {
      type: Number,
      default: 1,
    },
    repetitions: {
      type: Number,
      default: 0,
    },
    nextReview: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['new', 'learning', 'review'],
      default: 'new',
    },
    reading: { type: String, trim: true },
    romaji: { type: String, trim: true },
    pitch: { type: Number },
    meaning: { type: String, trim: true },
    example: { type: String, trim: true },
  },
  {
    timestamps: true, // 自动维护 createdAt / updatedAt
  },
);

// 用于查询用户所有到期卡片
CardSchema.index({ userId: 1, nextReview: 1 });

export const Card = mongoose.model<ICard>('Card', CardSchema);
