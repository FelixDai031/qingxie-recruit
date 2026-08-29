// app.js —— 小程序入口，负责初始化云开发环境
App({
  onLaunch() {
    // 云开发初始化：所有页面依赖此配置才能读写云数据库
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      // 云开发环境 ID（控制台首页顶部可复制，注意不是环境名）
      env: 'cloud1-6giqy8k5d07e579b',
      traceUser: true // 追踪用户，方便在云开发控制台看访问统计
    });
  }
});
