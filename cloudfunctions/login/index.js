// cloudfunctions/login/index.js —— 用户登录与资料管理
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event;

  // 1. 获取当前用户资料（用于进入页面时同步）
  if (action === 'get') {
    try {
      const { data } = await db.collection('users').where({ openid: OPENID }).get();
      return { ok: true, user: (data && data[0]) || null };
    } catch (err) {
      // 集合尚未创建等异常
      return { ok: false, msg: '请先在云开发控制台创建 users 集合', user: null };
    }
  }

  // 2. 登录 / 更新资料
  if (action === 'login') {
    const { nickName, avatarUrl } = event;
    const userData = {
      nickName: nickName || '微信用户',
      avatarUrl: avatarUrl || '',
      loginTime: db.serverDate()
    };

    try {
      const existing = await db.collection('users').where({ openid: OPENID }).get();
      if (existing.data && existing.data.length > 0) {
        // 已有记录，更新资料
        await db.collection('users').doc(existing.data[0]._id).update({ data: userData });
        return { ok: true, user: { ...existing.data[0], ...userData } };
      } else {
        // 新用户，写入
        const addRes = await db.collection('users').add({
          data: { openid: OPENID, ...userData, createTime: db.serverDate() }
        });
        return { ok: true, user: { _id: addRes._id, openid: OPENID, ...userData } };
      }
    } catch (err) {
      console.error('login error', err);
      return { ok: false, msg: '保存失败，请先在云开发控制台创建 users 集合' };
    }
  }

  return { ok: false, msg: '未知操作' };
};
