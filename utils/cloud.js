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

/**
 * 把 cloud:// 文件 ID 批量转换为 https 临时下载链接
 * 真机和小程序 <image>、wx.previewImage 都必须用 https URL 才能显示
 */
async function getCloudFileUrls(fileIDs) {
  if (!fileIDs || !fileIDs.length) return [];
  const list = fileIDs.map(id => id || '');
  const needConvert = list.filter(id => /^cloud:\/\//.test(id));
  if (needConvert.length === 0) return list;
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: needConvert });
    const map = {};
    (res.fileList || []).forEach(item => {
      map[item.fileID] = item.tempFileURL || item.fileID;
    });
    return list.map(id => map[id] || id);
  } catch (e) {
    console.error('getTempFileURL fail', e);
    return list;
  }
}

module.exports = {
  db,
  getDepartments,
  getOpenid,
  getCloudFileUrls
};
