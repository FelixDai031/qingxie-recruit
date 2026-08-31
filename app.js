// app.js —— 小程序入口，负责初始化云开发环境
// 云环境 ID 统一从 config/env.js 读取，不写死在这里
const { envId } = require('./config/env.js');

App({
  onLaunch() {
    // 云开发初始化：所有页面依赖此配置才能读写云数据库
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    if (!envId || envId === 'YOUR_CLOUD_ENV_ID') {
      console.error('请先在 config/env.js 中填写你自己的云环境 ID');
      return;
    }
    wx.cloud.init({
      env: envId,
      traceUser: true // 追踪用户，方便在云开发控制台看访问统计
    });
  }
});
