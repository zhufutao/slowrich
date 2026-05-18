// ============================================
// 慢富(SlowRich) - Cron Worker
// 每个交易日15:30自动抓取市场温度
// ============================================

import { Env } from '../types';
import { generateId, nowISO } from '../utils';
import { calculateMarketTemperature } from '../services/market';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cronId = generateId('cl');
    const startedAt = nowISO();

    console.log(`[Cron] 市场温度抓取开始: ${startedAt}`);

    try {
      // 执行温度计算
      const result = await calculateMarketTemperature(env.DB);

      if (result) {
        // 成功
        await env.DB.prepare(
          `INSERT INTO cron_logs (id, cron_type, status, message, started_at, finished_at)
           VALUES (?, 'market_temperature', 'success', ?, ?, ?)`
        ).bind(cronId, `温度值: ${result.value}, 等级: ${result.level}`, startedAt, nowISO()).run();

        console.log(`[Cron] 市场温度抓取成功: value=${result.value}, level=${result.level}`);
      } else {
        // 失败
        await env.DB.prepare(
          `INSERT INTO cron_logs (id, cron_type, status, message, started_at, finished_at)
           VALUES (?, 'market_temperature', 'failed', '温度计算返回空结果', ?, ?)`
        ).bind(cronId, startedAt, nowISO()).run();

        console.error('[Cron] 市场温度抓取失败: 返回空结果');
      }
    } catch (e: any) {
      // 异常
      await env.DB.prepare(
        `INSERT INTO cron_logs (id, cron_type, status, message, started_at, finished_at)
         VALUES (?, 'market_temperature', 'failed', ?, ?, ?)`
      ).bind(cronId, e.message.substring(0, 500), startedAt, nowISO()).run();

      console.error(`[Cron] 市场温度抓取异常: ${e.message}`);

      // 指数退避重试
      let retries = 0;
      const maxRetries = 4;
      const delays = [1000, 2000, 4000, 8000];

      while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delays[retries]));
        try {
          const retryResult = await calculateMarketTemperature(env.DB);
          if (retryResult) {
            console.log(`[Cron] 重试成功 (第${retries + 1}次): value=${retryResult.value}`);
            break;
          }
        } catch (retryError: any) {
          console.error(`[Cron] 重试失败 (第${retries + 1}次): ${retryError.message}`);
        }
        retries++;
      }

      if (retries >= maxRetries) {
        console.error('[Cron] 所有重试失败，降级为手动模式');
        // TODO: 通知管理员（通过飞书/邮件等）
      }
    }
  },
};
