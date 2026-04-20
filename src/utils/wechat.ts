import axios from 'axios';
import logger from './logger';

/** 微信 code2session 接口响应 */
interface WechatSessionResult {
  openid: string;
  session_key: string;
}

/** 微信接口错误响应 */
interface WechatErrorResult {
  errcode: number;
  errmsg: string;
}

/**
 * 调用微信 code2session 接口，将登录 code 换取 openid
 * @param code - 前端 wx.login() 返回的临时 code
 * @returns 用户的 openid
 * @throws 微信接口返回错误时抛出
 */
export async function code2session(code: string): Promise<string> {
  const appId = process.env.APP_ID;
  const appSecret = process.env.APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('APP_ID 或 APP_SECRET 未配置');
  }

  const url = 'https://api.weixin.qq.com/sns/jscode2session';
  const params = {
    appid: appId,
    secret: appSecret,
    js_code: code,
    grant_type: 'authorization_code',
  };

  const { data } = await axios.get<WechatSessionResult | WechatErrorResult>(url, { params });

  // 微信接口出错时返回 errcode 字段
  if ('errcode' in data && data.errcode !== 0) {
    logger.warn('微信 code2session 失败', { errcode: data.errcode, errmsg: data.errmsg });
    throw new Error(`微信登录失败：${data.errmsg}（${data.errcode}）`);
  }

  return (data as WechatSessionResult).openid;
}
