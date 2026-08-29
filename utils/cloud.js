// utils/cloud.js —— 云开发简单封装

/**
 * 获取云数据库引用
 */
function db() {
  return wx.cloud.database();
}

/**
 * 带 fallback 的查询：先查云数据库，失败或为空则返回本地示例数据
 */
async function getDepartments() {
  try {
    const { data } = await db().collection('departments').orderBy('sort', 'asc').get();
    if (data && data.length > 0) return data;
  } catch (e) {
    console.warn('读取云数据库失败，使用本地示例数据', e);
  }
  return require('./departments.js');
}

/**
 * 获取当前用户 openid（通过云函数或本地 context）
 */
async function getOpenid() {
  try {
    const { result } = await wx.cloud.callFunction({ name: 'adminCheck', data: { action: 'openid' } });
    return (result && result.openid) || '';
  } catch (e) {
    console.warn('获取 openid 失败', e);
    return '';
  }
}

module.exports = {
  db,
  getDepartments,
  getOpenid
};
