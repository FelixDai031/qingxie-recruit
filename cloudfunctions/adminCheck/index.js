// cloudfunctions/adminCheck/index.js —— 管理员校验（支持部门级权限）、审核、手机号解析
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ===== 审核结果订阅消息配置 =====
// 模板：报名审核通知（模版编号 4367，关键词已按「我的模板」详情页核对）
// thing14=审核结果  name2=姓名  thing19=报名项目  time17=审核时间  thing5=备注
const TMPL_ID = 'sReNVOM6bPCg3d-Kte1Mfr5RCSf6VKOv7OHory5nDXQ';
const TMPL_DATA = (d) => ({
  thing14: { value: d.result },    // 审核结果（通过/待定/不通过，20 字内）
  name2:   { value: d.name },      // 姓名（10 字内）
  thing19: { value: d.deptName },  // 报名项目（意向部门，20 字内）
  time17:  { value: d.time },      // 审核时间
  thing5:  { value: '详情请进小程序查看' } // 备注（20 字内）
});
// ================================

// ===== 管理员申请提醒（发给负责人）订阅消息配置 =====
// 模板：待处理申请提醒（模版编号 27490，字段已按「我的模板」详情页核对）
// thing2=申请人  thing10=申请类型  time4=申请时间  thing5=备注
const ADMIN_REQ_TMPL_ID = 'StX_veM_rCFpbFDjtsJkAp8_RLi2iUCmE71SafTiFLU';
const ADMIN_REQ_TMPL_DATA = (d) => ({
  thing2:  { value: d.applicant },  // 申请人（ID 前 8 位，20 字内）
  thing10: { value: d.type },       // 申请类型（管理员申请）
  time4:   { value: d.time },       // 申请时间
  thing5:  { value: d.remark }      // 备注（20 字内）
});
// ================================

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event;

  // 工具：获取当前管理员记录（null = 非管理员）
  // admins 记录结构：{ openid, deptIds: [], createTime }
  // deptIds 为空数组/缺省 = 可管理全部部门（负责人）；否则仅限所选部门（部门管理员）
  async function getAdmin() {
    const res = await db.collection('admins').where({ openid: OPENID }).get();
    return (res.data && res.data[0]) || null;
  }

  // 工具：计算当前管理员可管理部门的名称列表；null = 全部部门
  async function getAllowedDeptNames(adminRec) {
    const deptIds = (adminRec && Array.isArray(adminRec.deptIds)) ? adminRec.deptIds : [];
    if (deptIds.length === 0) return null;
    try {
      const res = await db.collection('departments').where({ _id: _.in(deptIds) }).get();
      return res.data.map(d => d.name);
    } catch (err) {
      console.error('getAllowedDeptNames error', err);
      return null;
    }
  }

  // 工具：判断某报名/部门的名称是否在权限范围内
  function nameAllowed(allowedNames, deptName) {
    if (!allowedNames) return true;
    return allowedNames.includes(deptName);
  }

  // 1. 获取当前 openid
  if (action === 'openid') {
    return { openid: OPENID };
  }

  // 2. 检查管理员权限（同时返回管理范围，供页面提示）
  if (action === 'check') {
    const rec = await getAdmin();
    if (!rec) return { ok: false };
    const allowed = await getAllowedDeptNames(rec);
    return { ok: true, deptNames: allowed, isAllDept: !allowed };
  }

  // 3. 手机号解析（个人主体可能受限，失败返回空）
  if (action === 'getPhone') {
    const { cloudID } = event;
    if (!cloudID) return { phone: '' };
    try {
      const res = await cloud.getOpenData({ list: [cloudID] });
      const phoneData = res.list && res.list[0] && res.list[0].data;
      const phoneNumber = phoneData && phoneData.phoneNumber;
      return { phone: phoneNumber || '' };
    } catch (err) {
      console.error('getPhone error', err);
      return { phone: '' };
    }
  }

  // 3.5 列出所有部门（公开可读，供管理员页与编辑页使用，走服务端避免客户端集合读权限限制）
  if (action === 'listDepts') {
    try {
      const { data } = await db.collection('departments').orderBy('sort', 'asc').get();
      return { ok: true, data: data || [] };
    } catch (err) {
      console.error('listDepts error', err);
      return { ok: false, msg: '部门列表读取失败' };
    }
  }

  // 3.6 读取单个部门（公开可读，供编辑页加载）
  if (action === 'getDept') {
    const { id } = event;
    if (!id) return { ok: false, msg: '缺少部门 id' };
    try {
      const res = await db.collection('departments').doc(id).get();
      return { ok: true, data: res.data };
    } catch (err) {
      console.error('getDept error', err);
      return { ok: false, msg: '部门读取失败' };
    }
  }

  // 3.7 读取招新配置（公开）：是否开放报名
  if (action === 'getConfig') {
    try {
      const res = await db.collection('config').doc('recruit').get();
      const d = res.data || {};
      return { ok: true, recruitOpen: d.recruitOpen !== false, recruitTag: d.recruitTag || '' };
    } catch (err) {
      // 配置不存在视为默认开放
      return { ok: true, recruitOpen: true, recruitTag: '' };
    }
  }

  // 3.8 查询当前用户是否已报名（防重复提交；被驳回的不算，允许重新报名）
  // 注意：管理员不受防重复限制（方便测试或代同学报名）
  if (action === 'myApply') {
    try {
      const rec = await getAdmin();
      if (rec) {
        return { ok: true, exists: false, isAdmin: true };
      }
      const res = await db.collection('applications').where({
        _openid: OPENID,
        status: _.neq('reject')
      }).limit(1).get();
      const item = res.data && res.data[0];
      return { ok: true, exists: !!item, deptName: item ? (item.deptName || '') : '', statusText: item ? (item.statusText || '') : '' };
    } catch (err) {
      console.error('myApply error', err);
      return { ok: false, msg: '查询失败' };
    }
  }

  // 3.9 申请成为管理员（登录用户提交，由负责人在管理页审批）
  if (action === 'requestAdmin') {
    try {
      // 已是管理员
      const rec = await getAdmin();
      if (rec) return { ok: false, msg: '你已经是管理员了' };
      // 已有待审核申请
      const exist = await db.collection('adminRequests').where({
        openid: OPENID,
        status: 'pending'
      }).get();
      if (exist.data && exist.data.length > 0) {
        return { ok: false, msg: '你已提交过申请，等待负责人审核' };
      }
      const addRes = await db.collection('adminRequests').add({
        data: { openid: OPENID, status: 'pending', createTime: db.serverDate() }
      });

      // 微信提醒负责人（全部部门管理员）：有新管理员申请待审批
      // 逐个发送，任一失败不影响申请结果
      if (ADMIN_REQ_TMPL_ID) {
        try {
          const now = new Date();
          const pad = n => (n < 10 ? '0' + n : n);
          const timeText = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
          const bosses = await db.collection('admins').get();
          const bossList = (bosses.data || []).filter(b => !Array.isArray(b.deptIds) || b.deptIds.length === 0);
          const notifyData = ADMIN_REQ_TMPL_DATA({
            applicant: (OPENID || '').slice(0, 8),
            type: '管理员申请',
            time: timeText,
            remark: '请进入小程序审批'
          });
          for (const boss of bossList) {
            try {
              await cloud.openapi.subscribeMessage.send({
                touser: boss.openid,
                templateId: ADMIN_REQ_TMPL_ID,
                page: 'pages/admin/admin',
                data: notifyData
              });
            } catch (e) {
              console.error('提醒负责人失败（跳过）', boss.openid, e);
            }
          }
        } catch (e) {
          console.error('管理员申请提醒流程失败（不影响申请）', e);
        }
      }

      return { ok: true, msg: '申请已提交，等待负责人审核' };
    } catch (err) {
      console.error('requestAdmin error', err);
      return { ok: false, msg: '提交失败，请稍后重试' };
    }
  }

  // 以下操作需要管理员权限（取出记录并计算部门权限范围）
  const adminRec = await getAdmin();
  if (!adminRec) {
    return { ok: false, msg: '无管理员权限' };
  }
  const allowedNames = await getAllowedDeptNames(adminRec);

  // 4. 列出报名（部门管理员只能看到自己部门的报名）
  if (action === 'list') {
    const { filter } = event;
    let where = {};
    if (filter && filter !== 'all') {
      where.status = filter;
    }
    if (allowedNames) {
      where.deptName = _.in(allowedNames);
    }
    const { data } = await db.collection('applications')
      .where(where)
      .orderBy('createTime', 'desc')
      .get();
    return { ok: true, data };
  }

  // 4.5 查询单条报名详情（供详情页使用，校验部门权限）
  if (action === 'detail') {
    const { id } = event;
    if (!id) return { ok: false, msg: '缺少 id' };
    try {
      const res = await db.collection('applications').doc(id).get();
      if (!nameAllowed(allowedNames, res.data && res.data.deptName)) {
        return { ok: false, msg: '无该部门的管理权限' };
      }
      return { ok: true, data: res.data };
    } catch (err) {
      console.error('detail error', err);
      return { ok: false, msg: '查询失败' };
    }
  }

  // 5. 更新审核状态（校验部门权限）
  if (action === 'update') {
    const { id, status, statusText } = event;
    if (!id || !status) return { ok: false, msg: '参数缺失' };

    let rec;
    try {
      rec = await db.collection('applications').doc(id).get();
      if (!nameAllowed(allowedNames, rec.data && rec.data.deptName)) {
        return { ok: false, msg: '无该部门的管理权限' };
      }
    } catch (err) {
      return { ok: false, msg: '报名记录不存在' };
    }

    await db.collection('applications').doc(id).update({
      data: {
        status,
        statusText,
        updateTime: db.serverDate()
      }
    });

    // 发送审核结果订阅消息（需先在小程序后台申请模板：填写下方 TMPL_ID 并按模板字段修改 TMPL_DATA）
    // 发送失败不影响审核结果。
    if (TMPL_ID && event.openid) {
      const now = new Date();
      const pad = n => (n < 10 ? '0' + n : n);
      const timeText = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: event.openid,
          templateId: TMPL_ID,
          page: 'pages/mine/mine',
          data: TMPL_DATA({
            name: (rec.data && rec.data.name) || '',
            deptName: (rec.data && rec.data.deptName) || '',
            result: statusText || '',
            time: timeText
          })
        });
      } catch (e) {
        console.error('发送订阅消息失败（不影响审核）', e);
      }
    }

    return { ok: true, msg: '更新成功' };
  }

  // 5.5 管理员更新部门简介 / 标语（部门管理员仅限自己部门）
  if (action === 'updateDept') {
    const { id, intro, slogan } = event;
    if (!id) return { ok: false, msg: '缺少部门 id' };
    try {
      const deptRes = await db.collection('departments').doc(id).get();
      if (!nameAllowed(allowedNames, deptRes.data && deptRes.data.name)) {
        return { ok: false, msg: '无该部门的管理权限' };
      }
    } catch (err) {
      return { ok: false, msg: '部门不存在' };
    }
    const data = { updateTime: db.serverDate() };
    if (intro !== undefined) {
      if (typeof intro !== 'string' || intro.length > 500) {
        return { ok: false, msg: '简介长度需在 500 字以内' };
      }
      data.intro = intro;
    }
    if (slogan !== undefined) {
      if (typeof slogan !== 'string' || slogan.length > 50) {
        return { ok: false, msg: '标语长度需在 50 字以内' };
      }
      data.slogan = slogan;
    }
    if (Object.keys(data).length <= 1) {
      return { ok: false, msg: '没有可更新的内容' };
    }
    try {
      await db.collection('departments').doc(id).update({ data });
      return { ok: true, msg: '部门信息已更新' };
    } catch (err) {
      console.error('updateDept error', err);
      return { ok: false, msg: '更新失败' };
    }
  }

  // 5.6 设置报名开放状态（管理员）
  if (action === 'setRecruitOpen') {
    const { recruitOpen } = event;
    if (typeof recruitOpen !== 'boolean') return { ok: false, msg: '参数缺失' };
    try {
      await db.collection('config').doc('recruit').set({
        data: { recruitOpen, updateTime: db.serverDate() }
      });
      return { ok: true, recruitOpen };
    } catch (err) {
      console.error('setRecruitOpen error', err);
      return { ok: false, msg: '保存失败：请在云开发控制台确认已创建 config 集合，并重试' };
    }
  }

  // 5.7 报名统计（管理员）：按状态 + 按部门（部门管理员仅统计自己部门）
  if (action === 'stats') {
    try {
      const $ = db.command.aggregate;
      const statusRes = await db.collection('applications')
        .aggregate()
        .match(allowedNames ? { deptName: _.in(allowedNames) } : {})
        .group({ _id: '$status', count: $.sum(1) })
        .end();
      const deptRes = await db.collection('applications')
        .aggregate()
        .match(allowedNames ? { deptName: _.in(allowedNames) } : {})
        .group({ _id: '$deptName', count: $.sum(1) })
        .end();
      const byStatus = {};
      let total = 0;
      (statusRes.list || []).forEach(it => {
        byStatus[it._id] = it.count;
        total += it.count;
      });
      const byDept = (deptRes.list || [])
        .filter(it => it._id)
        .map(it => ({ name: it._id, count: it.count }))
        .sort((a, b) => b.count - a.count);
      return { ok: true, total, byStatus, byDept };
    } catch (err) {
      console.error('stats error', err);
      return { ok: false, msg: '统计失败' };
    }
  }

  // 5.8 部门相册：添加照片（fileID 已由管理员客户端直传云存储，这里校验权限后写入部门数据）
  if (action === 'addDeptPhoto') {
    const { deptId, fileID } = event;
    if (!deptId || !fileID) return { ok: false, msg: '参数缺失' };
    try {
      const deptRes = await db.collection('departments').doc(deptId).get();
      const dept = deptRes.data;
      if (!dept) return { ok: false, msg: '部门不存在' };
      if (!nameAllowed(allowedNames, dept.name)) {
        return { ok: false, msg: '无该部门的管理权限' };
      }
      const photos = Array.isArray(dept.photos) ? dept.photos : [];
      if (photos.length >= 20) {
        return { ok: false, msg: '相册最多 20 张，请先删除部分照片' };
      }
      if (photos.includes(fileID)) {
        return { ok: true, photos, msg: '照片已存在' };
      }
      photos.push(fileID);
      await db.collection('departments').doc(deptId).update({
        data: { photos, updateTime: db.serverDate() }
      });
      return { ok: true, photos, msg: '上传成功' };
    } catch (err) {
      console.error('addDeptPhoto error', err);
      return { ok: false, msg: '添加失败' };
    }
  }

  // 5.9 部门相册：删除照片（同时清理云存储文件）
  if (action === 'removeDeptPhoto') {
    const { deptId, fileID } = event;
    if (!deptId || !fileID) return { ok: false, msg: '参数缺失' };
    try {
      const deptRes = await db.collection('departments').doc(deptId).get();
      const dept = deptRes.data;
      if (!dept) return { ok: false, msg: '部门不存在' };
      if (!nameAllowed(allowedNames, dept.name)) {
        return { ok: false, msg: '无该部门的管理权限' };
      }
      const photos = (Array.isArray(dept.photos) ? dept.photos : []).filter(p => p !== fileID);
      await db.collection('departments').doc(deptId).update({
        data: { photos, updateTime: db.serverDate() }
      });
      // 清理云存储（失败不影响结果，孤儿文件可在控制台清理）
      try {
        await cloud.deleteFile({ fileList: [fileID] });
      } catch (e) {
        console.error('deleteFile error', e);
      }
      return { ok: true, photos, msg: '已删除' };
    } catch (err) {
      console.error('removeDeptPhoto error', err);
      return { ok: false, msg: '删除失败' };
    }
  }

  // 6. 添加管理员（仅已有管理员可调用，支持指定管理部门；不传 deptIds = 全部部门）
  if (action === 'addAdmin') {
    const { openid, deptIds } = event;
    if (!openid) return { ok: false, msg: '缺少 openid' };
    const exist = await db.collection('admins').where({ openid }).get();
    if (exist.data && exist.data.length > 0) {
      return { ok: false, msg: '该用户已是管理员' };
    }
    // 校验所选部门有效性；空 = 全部部门
    let validDeptIds = [];
    if (Array.isArray(deptIds) && deptIds.length > 0) {
      try {
        const depRes = await db.collection('departments').where({ _id: _.in(deptIds) }).get();
        validDeptIds = depRes.data.map(d => d._id);
      } catch (err) {
        console.error('addAdmin 查询部门失败', err);
      }
      if (validDeptIds.length === 0) {
        return { ok: false, msg: '所选部门无效' };
      }
    }
    await db.collection('admins').add({
      data: { openid, deptIds: validDeptIds, createTime: db.serverDate() }
    });
    return {
      ok: true,
      msg: validDeptIds.length
        ? '添加成功（限 ' + validDeptIds.length + ' 个部门）'
        : '添加成功（全部部门）'
    };
  }

  // 6.5 管理员申请审批：列出待审核申请
  if (action === 'listAdminRequests') {
    try {
      const { data } = await db.collection('adminRequests')
        .where({ status: 'pending' })
        .orderBy('createTime', 'desc')
        .get();
      return { ok: true, data };
    } catch (err) {
      console.error('listAdminRequests error', err);
      return { ok: false, msg: '查询失败' };
    }
  }

  // 6.6 同意申请（写入 admins，默认全部部门；deptIds 可选）
  if (action === 'approveAdmin') {
    const { id, deptIds } = event;
    if (!id) return { ok: false, msg: '缺少申请 id' };
    try {
      const reqRes = await db.collection('adminRequests').doc(id).get();
      const req = reqRes.data;
      if (!req || req.status !== 'pending') {
        return { ok: false, msg: '申请不存在或已处理' };
      }
      // 防重复：已是管理员则直接关闭申请
      const exist = await db.collection('admins').where({ openid: req.openid }).get();
      let msg;
      if (exist.data && exist.data.length > 0) {
        msg = '该用户已是管理员';
      } else {
        let validDeptIds = [];
        if (Array.isArray(deptIds) && deptIds.length > 0) {
          try {
            const depRes = await db.collection('departments').where({ _id: _.in(deptIds) }).get();
            validDeptIds = depRes.data.map(d => d._id);
          } catch (err) { /* 忽略，退化为全部部门 */ }
        }
        await db.collection('admins').add({
          data: { openid: req.openid, deptIds: validDeptIds, createTime: db.serverDate() }
        });
        msg = validDeptIds.length ? '已同意（限 ' + validDeptIds.length + ' 个部门）' : '已同意（全部部门）';
      }
      await db.collection('adminRequests').doc(id).update({
        data: { status: 'approved', handleTime: db.serverDate() }
      });
      return { ok: true, msg };
    } catch (err) {
      console.error('approveAdmin error', err);
      return { ok: false, msg: '操作失败' };
    }
  }

  // 6.7 拒绝申请
  if (action === 'rejectAdmin') {
    const { id } = event;
    if (!id) return { ok: false, msg: '缺少申请 id' };
    try {
      await db.collection('adminRequests').doc(id).update({
        data: { status: 'rejected', handleTime: db.serverDate() }
      });
      return { ok: true, msg: '已拒绝' };
    } catch (err) {
      console.error('rejectAdmin error', err);
      return { ok: false, msg: '操作失败' };
    }
  }

  // 7. 未知操作
  return { ok: false, msg: '未知操作' };
};
