import mongoose, { Document, Schema } from 'mongoose';

/** 连续打卡数据结构 */
export interface IStreak {
  current: number;
  longest: number;
  lastDate: string; // 'YYYY-MM-DD'
}

/** User 文档接口 */
export interface IUser extends Document {
  openid: string;
  createdAt: Date;
  streak: IStreak;
}

const StreakSchema = new Schema<IStreak>(
  {
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    lastDate: { type: String, default: '' },
  },
  { _id: false }, // 内嵌对象不需要独立 _id
);

const UserSchema = new Schema<IUser>(
  {
    openid: {
      type: String,
      required: true,
      unique: true, // unique 已自动创建唯一索引，无需额外 index: true
    },
    streak: {
      type: StreakSchema,
      default: () => ({ current: 0, longest: 0, lastDate: '' }),
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  },
);

export const User = mongoose.model<IUser>('User', UserSchema);
