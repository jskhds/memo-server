import mongoose, { Document, Schema, Types } from 'mongoose';

/** ReviewRecord 文档接口 */
export interface IReviewRecord extends Document {
  userId: Types.ObjectId;
  date: string; // 'YYYY-MM-DD'
  count: number;
}

const ReviewRecordSchema = new Schema<IReviewRecord>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  count: {
    type: Number,
    default: 0,
  },
});

// 同一用户同一天只有一条记录
ReviewRecordSchema.index({ userId: 1, date: 1 }, { unique: true });

export const ReviewRecord = mongoose.model<IReviewRecord>('ReviewRecord', ReviewRecordSchema);
