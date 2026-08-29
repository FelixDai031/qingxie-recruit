# 上线前最终核验 + 上传清单（2026-08-24）

## 一、本地代码核验结论 ✅
- **13 个 JS 文件**语法全部通过（`node --check`）。
- **5 个关键 JSON**（app.json / project.config.json / sitemap.json / 两个云函数 package.json）解析正常。
- **关键修复点确认在位**：
  - `pages/admin/admin.js`：导出改用 `wx.cloud.downloadFile({ fileID })`（真机更稳定）。
  - `cloudfunctions/exportExcel/index.js`：加 try-catch + 始终返回 fileID，错误文案明确。
  - `pages/apply/apply.wxml`：6 处占位符均用 `placeholder-class="ph"`（iOS/Android 正常显示）。
  - `pages/mine/mine.js`：openid 从 `login` 取 + 「申请管理员认证」按钮。
  - `pages/adminDetail/` 详情页存在；审核页收起/展开逻辑在位。

## 二、你在开发者工具里要做的事

### 步骤 1：保存全部
`Ctrl + S` 保存所有文件（或点菜单「文件 → 保存所有」）。

### 步骤 2：部署云函数（关键，必须「云端安装依赖」）
在左侧「云开发 → 云函数」列表中，对以下函数**逐个**右键 → **「上传并部署：云端安装依赖」**：
1. `exportExcel`（必须装 `xlsx`，否则真机导出失败）
2. `adminCheck`
3. `login`
4. `initData`（如需重置部门/管理员数据）

> 验证：右键 `exportExcel` →「测试」→ 返回 `ok:true` 且带 `fileID` 即正常。

### 步骤 3：上传小程序代码
- 点开发者工具右上角 **「上传」**。
- 版本号建议填 `1.0.4`（比线上高即可）。
- 备注写「修复导出下载 / ID 显示 / 占位符 / 详情页」。

### 步骤 4：提审 + 发布
1. 进 mp.weixin.qq.com → 管理 → **版本管理**。
2. 刚上传的在「开发版本」，点 **「提交审核」**。
3. 审核通过后点 **「发布」**，线上才是修好的版本。

### 步骤 5（如未配置过）：隐私保护指引
- 小程序后台 → 设置 → **用户隐私保护指引**。
- 勾选：姓名、学号、手机号、学院、专业、自我介绍。
- 用途填「用于校青协招新报名与审核」。

## 三、上线后真机验收
1. 手机扫码/搜索打开小程序。
2. 「我的」页 ID 应正常显示（非 undefined）。
3. 管理员进审核页 → 点「导出」→ 应自动调起 **WPS** 打开 xlsx。
4. 如有异常，截图弹窗完整错误文案反馈。
