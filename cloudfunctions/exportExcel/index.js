// cloudfunctions/exportExcel/index.js —— 将报名表导出为 Excel（.xlsx）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const xlsx = require('xlsx');

const STATUS_MAP = { pending: '待审核', pass: '已通过', wait: '待定', reject: '不通过' };

exports.main = async (event, context) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) {
      return { ok: false, msg: '未能获取用户身份，请重新登录' };
    }

    // 仅管理员可导出；部门管理员只能导出自己部门的报名
    const adminRes = await db.collection('admins').where({ openid: OPENID }).get();
    if (!adminRes.data || adminRes.data.length === 0) {
      return { ok: false, msg: '无管理员权限' };
    }
    const adminRec = adminRes.data[0];
    const adminDeptIds = (adminRec && Array.isArray(adminRec.deptIds)) ? adminRec.deptIds : [];
    let allowedNames = null;
    if (adminDeptIds.length > 0) {
      try {
        const depRes = await db.collection('departments').where({ _id: _.in(adminDeptIds) }).get();
        allowedNames = depRes.data.map(d => d.name);
      } catch (err) {
        console.error('查询管理部门失败', err);
      }
      if (!allowedNames || allowedNames.length === 0) {
        return { ok: false, msg: '未分配可管理的部门，无法导出' };
      }
    }

    // 查询条件：优先按勾选的 ids；否则按筛选状态
    const { filter, ids } = event;
    let query;
    if (Array.isArray(ids) && ids.length > 0) {
      query = db.collection('applications').where({ _id: _.in(ids) });
    } else {
      let where = {};
      if (filter && filter !== 'all') where = { status: filter };
      if (allowedNames) where.deptName = _.in(allowedNames);
      query = db.collection('applications').where(where);
    }

    const { data } = await query.orderBy('createTime', 'desc').limit(1000).get();

    // 勾选导出时兜底过滤：只保留权限范围内的部门
    const filtered = (data || []).filter(item => !allowedNames || allowedNames.includes(item.deptName));

    if (!filtered || filtered.length === 0) {
      return { ok: false, msg: '没有可导出的报名数据' };
    }

    const rows = filtered.map(item => ({
      姓名: item.name || '',
      学号: item.stuId || '',
      学院: item.college || '',
      专业: item.major || '',
      手机号: item.phone || '',
      意向部门: item.deptName || '',
      状态: STATUS_MAP[item.status] || item.statusText || '',
      自我介绍: item.intro || '',
      提交时间: formatDate(item.createTime)
    }));

    // 生成 xlsx 二进制
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, '报名表');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // 写入云存储
    const fileName = `报名表_${formatDate(new Date(), true)}.xlsx`;
    const cloudPath = `exports/${fileName}`;
    const upRes = await cloud.uploadFile({ cloudPath, fileContent: buffer });
    if (!upRes || !upRes.fileID) {
      return { ok: false, msg: '文件上传云存储失败' };
    }

    // 在云函数内生成临时下载链接
    let fileURL = '';
    try {
      const { fileList } = await cloud.getTempFileURL({ fileList: [upRes.fileID] });
      if (fileList && fileList[0]) fileURL = fileList[0].tempFileURL;
    } catch (e) {
      console.error('getTempFileURL error', e);
      fileURL = '';
    }

    return { ok: true, fileID: upRes.fileID, fileURL, fileName };
  } catch (err) {
    console.error('exportExcel error', err);
    return { ok: false, msg: '云函数内部错误：' + (err && err.message ? err.message : String(err)) };
  }
};

function formatDate(d, forName) {
  const date = new Date(d);
  const pad = n => (n < 10 ? '0' + n : n);
  if (forName) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
