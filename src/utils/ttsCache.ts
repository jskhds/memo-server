/** MD5 内存缓存，key = md5(text)，value = base64 音频 */
const cache = new Map<string, string>();

export const hasCache = (key: string): boolean => cache.has(key);

export const getCache = (key: string): string | undefined => cache.get(key);

export const setCache = (key: string, value: string): void => {
  cache.set(key, value);
};
