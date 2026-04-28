import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { sendSuccess, sendError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/** 平假名 Unicode 范围：U+3041（ぁ）~ U+3096（ゖ） */
const HIRAGANA_RE = /^[ぁ-ゖ]$/;
/** 片假名 Unicode 范围：U+30A1（ァ）~ U+30F6（ヶ） */
const KATAKANA_RE = /^[ァ-ヶ]$/;

/** 笔顺数据目录，开发（src/）与生产（dist/）路径均可向上两级到达 public/ */
const STROKE_DATA_DIR = path.join(__dirname, '../../public/stroke-data');

interface StrokePoint {
  x: number;
  y: number;
}

interface StrokeEntry {
  id: number;
  points: StrokePoint[];
}

interface StrokeFileData {
  character: string;
  unicode: string;
  strokes: StrokeEntry[];
}

/**
 * GET /api/stroke-data/:char
 * 返回单个平/片假名字符的笔顺数据
 * - 字符需 URL encode（e.g. %E3%81%82 → あ）
 * - 响应：{ char, strokes: [{ id, points: [{x,y}] }] }
 */
export async function getStrokeData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const char = decodeURIComponent(req.params.char ?? '');

    if (!char || char.length !== 1) {
      sendError(res, 400, 'char 参数须为单个假名字符');
      return;
    }

    if (!HIRAGANA_RE.test(char) && !KATAKANA_RE.test(char)) {
      sendError(res, 404, `字符「${char}」不在平假名或片假名范围内`);
      return;
    }

    // 码点转 5 位小写十六进制，与文件名格式对齐（如 あ → 03042）
    const codePoint = char.codePointAt(0) as number;
    const hex = codePoint.toString(16).padStart(5, '0');
    const filePath = path.join(STROKE_DATA_DIR, `${hex}.json`);

    // 文件不存在时返回 404（.catch 避免 try/catch 块中变量未初始化的 TS 报错）
    const raw = await fs.promises.readFile(filePath, 'utf-8').catch(() => null);
    if (raw === null) {
      sendError(res, 404, `暂无「${char}」的笔顺数据`);
      return;
    }

    const data = JSON.parse(raw) as StrokeFileData;

    logger.info('笔顺数据查询', { char, hex, strokeCount: data.strokes.length });
    sendSuccess(res, { char: data.character, strokes: data.strokes });
  } catch (err) {
    next(err);
  }
}
