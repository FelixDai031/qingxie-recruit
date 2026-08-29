# 校青协招新小程序

一个基于微信云开发的校园青年志愿者协会招新小程序。

## 功能

- 首页：协会介绍、招新倒计时、部门入口、招新流程、常见问题
- 部门详情：部门职责、招新要求、一键跳转报名
- 报名表：姓名 / 学号 / 学院 / 专业 / 手机号 / 意向部门 / 自我介绍
- 我的报名：查看报名记录与审核状态
- 管理员审核：通过 / 待定、按状态筛选
- 社交分享：首页与部门页均可转发到班级群

## 技术栈

- 微信小程序原生框架（WXML / WXSS / JS）
- 微信云开发（CloudBase）：云数据库 + 云函数
- 无需自建服务器

## 目录结构

```
qingxie-recruit/
├── app.js                    # 小程序入口，初始化云开发
├── app.json                  # 页面路由与 tabBar
├── app.wxss                  # 全局样式
├── project.config.json       # 项目配置（含云函数根目录）
├── pages/
│   ├── index/                # 招新首页
│   ├── department/           # 部门详情
│   ├── apply/                # 报名表单
│   ├── mine/                 # 我的报名
│   └── admin/                # 管理员审核
├── utils/
│   ├── cloud.js              # 云数据库简单封装
│   └── departments.js        # 部门示例数据（兜底）
├── cloudfunctions/
│   ├── adminCheck/           # 云函数：权限校验 / 审核 / 手机号解析
│   └── initData/             # 云函数：一键初始化（写入部门数据 + 设管理员）
├── data/
│   ├── departments.seed.json # 部门数据种子，可导入云数据库
│   └── admins.seed.example.json # 管理员记录模板（手动导入方式用）
└── scripts/
    └── gen_tab_icons.py      # 生成 tabBar 图标的脚本
```

## 快速开始

### 1. 准备小程序账号

1. 前往 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序账号。
2. 记录你的 **AppID**（在“开发管理 → 开发设置”里）。
3. 用微信开发者工具导入本项目目录 `qingxie-recruit`。
4. 在 `project.config.json` 里把 `appid` 的 `touristappid` 改成你的真实 AppID。

### 2. 开通云开发

1. 微信开发者工具点击顶部“云开发”按钮，按提示开通。
2. 开通后记录你的 **环境 ID**。
3. 打开 `app.js`，把 `wx.cloud.init({ env: '' })` 里的 `env` 改成你的环境 ID（也可留空使用默认环境）。

### 3. 部署云函数

1. 在开发者工具中右键 `cloudfunctions/adminCheck` → “创建并部署：云端安装依赖”。
2. 右键 `cloudfunctions/initData` → “创建并部署：云端安装依赖”。
3. 等待两个云函数部署完成。

### 4. 一键初始化数据（推荐）

不再需要手动导入 JSON，`initData` 云函数会自动完成：

1. 确认云开发控制台已创建 `departments`、`applications`、`admins` 三个集合（没有的话，`initData` 也会自动创建，但建议手动创建并设置权限）。
2. 在开发者工具模拟器中打开小程序，进入 **“我的”** 页面。
3. 点击 **“初始化数据（首次使用点这里）”**。
4. 完成后会自动写入 6 个示例部门，并把当前微信账号设为管理员（“初始化”入口自动变成“管理员入口”）。

> 安全机制：`initData` 仅在 `admins` 集合为空时执行，防止误覆盖已有配置。

### 5. 手动导入部门数据（备选）

1. 进入云开发控制台 → 数据库 → 新建集合 `departments`（权限：**所有用户可读，仅创建者可读写**）。
2. 在集合列表里点击 `departments` → “导入”，选择 `data/departments.seed.json`。
3. 导入成功后即可在首页看到部门列表。

> 如需修改部门内容，直接编辑云数据库里的 `departments` 集合，或重新导入一份 JSON。

### 6. 创建 applications 集合

1. 在云开发控制台新建集合 `applications`。
2. 设置数据权限为 **“仅创建者可读写”**（默认即可）。
3. 这样普通用户只能查看和修改自己的报名，管理员通过云函数拥有更高权限。

### 7. 添加管理员（手动方式备选）

如果不用一键初始化，也可以手动配置：

1. 在开发者工具中点击“真机调试”或“预览”，用自己的微信打开小程序。
2. 进入“我的”页面，查看 Console 输出，会打印当前用户的 `openid`。
3. 在云开发控制台 → 数据库 → 新建集合 `admins`。
4. 在 `admins` 集合中添加一条记录：
   ```json
   {
     "openid": "复制你的openid",
     "role": "admin"
   }
   ```
5. 设置 `admins` 集合权限为 **“仅创建者可读写”**。
6. 重新进入“我的”页面，即可看到“管理员入口”。

### 8. 配置隐私保护指引

由于报名表收集了姓名、学号、手机号等个人信息，必须配置隐私保护指引：

1. 登录小程序后台 → 设置 → 基本设置 → 用户隐私保护指引。
2. 添加 **“收集你的手机号”**、**“收集你的姓名、学号等身份信息”** 等说明项。
3. 在 `pages/apply/apply.wxml` 中已内置隐私授权勾选框，确保提审时能通过隐私合规检查。

### 8. 订阅消息（可选）

如果希望在审核通过后通知用户：

1. 小程序后台 → 功能 → 订阅消息 → 添加模板（如“报名结果通知”）。
2. 复制模板 ID。
3. 打开 `pages/apply/apply.js`，把 `wx.requestSubscribeMessage` 里的 `REPLACE_WITH_YOUR_TEMPLATE_ID` 替换为你的模板 ID。
4. 在云函数 `adminCheck/index.js` 的 `update` action 中取消注释订阅消息发送代码，并填入模板 ID。

## 提审前检查清单

- [ ] `project.config.json` 的 `appid` 已替换为真实 AppID
- [ ] `app.js` 的云开发环境 ID 已配置
- [ ] 云函数 `adminCheck`、`initData` 已部署
- [ ] `departments`、`applications`、`admins` 三个集合已创建
- [ ] `departments` 权限为“所有用户可读”，`applications` 与 `admins` 权限正确设置
- [ ] 小程序后台已配置《用户隐私保护指引》
- [ ] 招新文案、图片不涉及违规内容
- [ ] 手机号一键填入失败时有降级提示（已内置）

## 常见问题

**Q：打开首页后部门列表空白？**
A：检查云开发是否开通、`departments` 集合是否已导入数据、集合权限是否为“所有用户可读”。

**Q：提交报名报错？**
A：确认 `applications` 集合已创建，并且云函数 `adminCheck` 已部署。

**Q：管理员入口不出现？**
A：确认 `admins` 集合里的 `openid` 与当前登录用户一致（注意大小写）。

**Q：手机号一键填入没反应？**
A：个人主体小程序可能受能力限制，代码已降级为手动输入。如需此功能，建议使用企业/组织主体小程序并申请手机号快速验证组件。

## 自定义主题

如果你想换主题色，修改以下地方：

- `app.wxss` 里的 `--primary` / `--primary-light`
- 各页面中的 `linear-gradient(135deg, #FF5630, #FF8A50)`
- 重新运行 `python scripts/gen_tab_icons.py` 生成新的 tabBar 图标

## License

MIT
