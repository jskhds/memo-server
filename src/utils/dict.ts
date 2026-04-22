import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

interface DictEntry {
  reading: string;
  meaning: string;
}

let dictMap: Map<string, DictEntry> | null = null;

/** 懒加载字典，首次调用时读取文件并建立内存索引 */
function getDict(): Map<string, DictEntry> {
  if (dictMap) return dictMap;

  const dictPath = path.join(__dirname, '../../data/jmdict.json');
  logger.info('加载本地词典...', { path: dictPath });
  const raw = fs.readFileSync(dictPath, 'utf-8');
  const obj = JSON.parse(raw) as Record<string, DictEntry>;
  dictMap = new Map(Object.entries(obj));
  logger.info('词典加载完成', { size: dictMap.size });
  return dictMap;
}

/** 查词，返回 reading + meaning，未找到返回 null */
export function lookupWord(word: string): DictEntry | null {
  const dict = getDict();
  return dict.get(word) ?? null;
}
