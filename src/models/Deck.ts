import mongoose, { Document, Schema, Types } from 'mongoose';

/** Deck 文档接口 */
export interface IDeck extends Document {
  userId: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeckSchema = new Schema<IDeck>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // 不单独建索引：复合唯一索引 { userId, name } 前缀已覆盖 userId 查询
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true, // 自动维护 createdAt / updatedAt
  },
);

// 同一用户下卡组名唯一
DeckSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Deck = mongoose.model<IDeck>('Deck', DeckSchema);
