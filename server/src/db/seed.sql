-- ============================================
-- 慢富(SlowRich) 初始数据
-- 管理员账号密码: admin@666 / 666666
-- bcrypt hash of "666666" with cost 10
-- ============================================

-- 默认管理员（must_change_password=1，首次登录强制修改密码）
INSERT INTO users (id, email, password_hash, role, must_change_password)
VALUES ('u_admin001', 'admin@666', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', 1);

-- 示例股票
INSERT INTO stocks (id, code, name, market, created_by)
VALUES
  ('s_001', '600036', '招商银行', 'SH', 'u_admin001'),
  ('s_002', '000858', '五粮液', 'SZ', 'u_admin001'),
  ('s_003', '601318', '中国平安', 'SH', 'u_admin001'),
  ('s_004', '000001', '平安银行', 'SZ', 'u_admin001'),
  ('s_005', '600519', '贵州茅台', 'SH', 'u_admin001');
