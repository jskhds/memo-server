import * as crypto from 'crypto';
import * as WebSocket from 'ws';

function buildXfyunUrl(): string {
  const apiKey = process.env.APIKey ?? '';
  const apiSecret = process.env.APISecret ?? '';
  const host = 'tts-api.xfyun.cn';
  const path = '/v2/tts';
  const date = new Date().toUTCString();

  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');

  return (
    `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}` +
    `&date=${encodeURIComponent(date)}&host=${host}`
  );
}

/**
 * 调用讯飞 WebSocket TTS，返回 base64 MP3 音频字符串
 * @throws 超时、WebSocket 错误、讯飞错误码
 */
export async function synthesizeSpeech(text: string, appId: string): Promise<string> {
  const wsUrl = buildXfyunUrl();
  const audioChunks: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket.WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('讯飞 TTS WebSocket 超时'));
    }, 15000);

    ws.on('open', () => {
      const payload = {
        common: { app_id: appId },
        business: {
          aue: 'lame',
          sfl: 1,
          auf: 'audio/L16;rate=16000',
          vcn: 'x2_JaJp_ZhongCun',
          speed: 50,
          volume: 50,
          pitch: 50,
          tte: 'UTF8',
        },
        data: {
          status: 2,
          text: Buffer.from(text).toString('base64'),
        },
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          code: number;
          data?: { audio?: string; status?: number };
        };
        if (msg.code !== 0) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`讯飞 TTS 错误码 ${msg.code}`));
          return;
        }
        if (msg.data?.audio) {
          audioChunks.push(msg.data.audio);
        }
        if (msg.data?.status === 2) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch (parseErr) {
        clearTimeout(timeout);
        ws.close();
        reject(parseErr);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const audioBuffer = Buffer.concat(audioChunks.map((chunk) => Buffer.from(chunk, 'base64')));
  return audioBuffer.toString('base64');
}
